import chalk from 'chalk'
import type { CodeChunk } from '../ingestion/types.js'
import { getProvider } from '../providers/router.js'
import {
  type AgentFinding,
  type AgentContext,
  type AgentName,
  annotateComplexity,
  buildChunkContext,
  buildSystemPrompt,
  computeMaxTokens,
  completeAndParseFindings,
  unparsableResponseFinding,
  verifyCriticalHighFindings,
} from './base.js'
import type { IAgent } from './base.js'
import { validateAndFingerprintFindings } from '../orchestrator/findingValidation.js'
import { SECURITY_FOCUS } from './specialist/security.js'
import { ARCHITECTURE_FOCUS } from './specialist/architecture.js'
import { PERFORMANCE_FOCUS } from './specialist/performance.js'
import { MAINTAINABILITY_WARNING, MAINTAINABILITY_FOCUS } from './specialist/maintainability.js'
import { DEAD_CODE_WARNING, DEAD_CODE_FOCUS } from './specialist/deadCode.js'
import {
  TEST_INTELLIGENCE_WARNING,
  TEST_INTELLIGENCE_FOCUS,
} from './specialist/testIntelligence.js'
import { PRAGMATISM_FOCUS } from './specialist/pragmatism.js'
import { LOGIC_FOCUS } from './specialist/logic.js'

/**
 * Economy-mode analyzer: runs ALL specialist domains in a single provider call
 * per batch, with domain-tagged output, instead of N parallel per-domain calls.
 *
 * This is the one token-efficiency mechanism that actually cuts the ~6x resend
 * of the same chunk content across agents. The other candidate mechanisms are
 * non-viable here:
 *   - Provider prefix caching: each agent has a DIFFERENT system prompt, so the
 *     shared chunk content (in the user-message position) never forms a shared
 *     cacheable prefix across agents. Intra-agent caching is already automatic.
 *   - Shared system-prompt prefix: the system prompts differ per domain, so
 *     there is no shared prefix to dedupe.
 *
 * Tradeoff taken (rule 5 — stated, not dodged): combining domains into one call
 *   - LOSES parallelism: 6 agents finish in ~1 wall-clock call length, but a
 *     single combined call must read all domains, so its latency is closer to
 *     the slowest agent than the fastest. Net: latency usually goes UP, spend
 *     goes DOWN. Users opt in when cost > latency.
 *   - WEAKENS domain specificity: one prompt can't be as richly tuned per
 *     domain as six dedicated prompts. Findings may be less precise.
 *   - KEEPS per-domain scoring: each finding is tagged with its agentName, so
 *     the category score breakdown and synthesis pipeline are unchanged.
 */

/** Per-domain instruction block appended to the combined system prompt. */
export interface DomainSpec {
  name: AgentName
  label: string
  focus: string
}

export const DEFAULT_DOMAINS: DomainSpec[] = [
  {
    name: 'security',
    label: 'Security',
    focus: 'injection risks, auth gaps, hardcoded secrets, missing input validation',
  },
  {
    name: 'architecture',
    label: 'Architecture',
    focus: 'circular dependencies, layer violations, tight coupling, God objects',
  },
  {
    name: 'performance',
    label: 'Performance',
    focus: 'N+1 patterns, unbounded loops, missing caching, sync-in-async',
  },
  {
    name: 'maintainability',
    label: 'Maintainability',
    focus: 'duplicated logic, inconsistent naming, undocumented complexity',
  },
  {
    name: 'deadCode',
    label: 'Dead Code',
    focus: 'unused exports, zombie routes, unwired classes, stale TODOs',
  },
  {
    name: 'testIntelligence',
    label: 'Test Intelligence',
    focus: 'untested critical paths, hollow mocks, missing edge cases',
  },
  {
    name: 'logic',
    label: 'Logic & Correctness',
    focus: 'logical flaws, state mismanagement, race conditions, invalid assumptions',
  },
  {
    name: 'pragmatism',
    label: 'Pragmatism',
    focus: 'over-engineering, premature abstractions, unneeded configurability, YAGNI violations',
  },
]

// Anti-false-positive guardrail block for each built-in domain, sourced
// VERBATIM from the matching specialist/*.ts prompt (imported above) rather
// than a second hand-written copy. Every parallel per-domain agent carries
// domain-specific false-positive guidance (e.g. security.ts's "deprioritize
// BUILD-TIME FILES... verify a gap actually exists" block, deadCode.ts's
// partial-chunk warning) that economy mode's combined prompt used to either
// omit or paraphrase into a shorter, drift-prone summary. Keyed by domain
// name (not stored per-DomainSpec-instance) so even a caller-supplied custom
// domain subset still gets the real guardrail text for any built-in name it
// includes (agents-001).
const DOMAIN_GUARDRAILS: Partial<Record<AgentName, string>> = {
  security: SECURITY_FOCUS,
  architecture: ARCHITECTURE_FOCUS,
  performance: PERFORMANCE_FOCUS,
  maintainability: `${MAINTAINABILITY_WARNING}\n\n${MAINTAINABILITY_FOCUS}`,
  deadCode: `${DEAD_CODE_WARNING}\n\n${DEAD_CODE_FOCUS}`,
  testIntelligence: `${TEST_INTELLIGENCE_WARNING}\n\n${TEST_INTELLIGENCE_FOCUS}`,
  logic: LOGIC_FOCUS,
  pragmatism: PRAGMATISM_FOCUS,
}

function buildCombinedSystemPrompt(domains: DomainSpec[]): string {
  const sections = domains
    .map((d) => {
      const guardrails = DOMAIN_GUARDRAILS[d.name]
      const guardrailBlock = guardrails ? `\n\n${guardrails}` : ''
      return `### ${d.label} (agentName: "${d.name}")\nLook for: ${d.focus}.${guardrailBlock}`
    })
    .join('\n\n')

  const prompt = `You are a combined multi-domain code review swarm. You are reviewing code as part of a larger analysis.

You must review the provided code through ALL of the following lenses in a single pass:

${sections}

Before outputting any JSON, you MUST write a <thinking> block to trace data flow, analyze edge cases, and justify your logic for all domains.
At the end of your <thinking> block, perform a Self-Critique: ask yourself if there are any conditions where the code is actually safe or if you might be hallucinating. If the code is safe, drop the finding.

After your <thinking> block, return ONLY a valid JSON array of findings. No other text.

Each finding must match this exact schema, and MUST include its originating agentName:
{
  "agentName": ${domains.map((d) => `"${d.name}"`).join(' | ')},
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "title": "Short title, max 10 words",
  "description": "2-4 sentences. Be specific. Explain the risk or problem clearly.",
  "filePath": "relative/path/to/file.ts",
  "lineStart": 42,
  "lineEnd": 67,
  "symbolName": "functionName (optional)",
  "tags": ["tag1", "tag2"]
}

- Be specific. Reference exact file paths and line numbers from the context provided.
- If two of your lenses disagree on the same piece of code, do NOT arbitrate
  the conflict yourself — output both conflicting findings as-is, tagged with
  their own agentName. A downstream arbiter resolves conflicts across all
  findings.
`

  return prompt
}

/**
 * A drop-in IAgent whose .analyze runs all domains in one provider call.
 * Carries a synthetic name for logging; real attribution comes from each
 * finding's agentName field.
 */
export class CombinedAnalyzer implements IAgent {
  readonly name: AgentName = 'combined' as AgentName
  // Public (not private) so swarm.ts can attribute a fully-failed combined
  // batch back to each logical domain it covers, instead of just 'combined'
  // (scorer-001).
  readonly domains: DomainSpec[]

  constructor(domains?: DomainSpec[]) {
    this.domains = domains ?? DEFAULT_DOMAINS
  }

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary', 'combined')
      const systemPrompt = buildSystemPrompt(
        buildCombinedSystemPrompt(this.domains),
        context,
        context.modeConfig
      )
      const userPrompt = buildChunkContext(chunks)
      // Shared, parameterized formula (base.ts's computeMaxTokens) instead of
      // a second hand-copied variant — a single call has to fit findings for
      // every domain AND every chunk in the batch, so the output budget must
      // scale with both (agents-003).
      const maxTokens = computeMaxTokens(chunks.length, this.domains.length)
      const { findings: rawFindings, response } = await completeAndParseFindings(
        provider,
        { systemPrompt, userPrompt, maxTokens, signal },
        this.name,
        true
      )
      const findings = attributeFindings(
        rawFindings,
        this.domains,
        response.provider,
        response.model
      )
      // attributeFindings silently drops any finding whose agentName didn't
      // match an active domain (even after alias normalization) — that must
      // not look identical to "the model reviewed this and found nothing".
      // Surface it as a real (info, zero-penalty) finding that flows through
      // the normal merge/score/report pipeline, mirroring base.ts's
      // unparsableResponseFinding pattern for a totally unparsable response
      // (agents-002). Computed here (not inside attributeFindings) so that
      // function stays a pure, directly-unit-testable attribution filter.
      const droppedCount = rawFindings.length - findings.length
      if (droppedCount > 0) {
        findings.push(
          ...unparsableResponseFinding(
            this.name,
            `dropped ${droppedCount} finding(s) with an agentName that didn't match any active domain`
          )
        )
      }
      const validated = validateAndFingerprintFindings(findings, chunks)
      annotateComplexity(validated, chunks)
      return verifyCriticalHighFindings(validated, chunks, provider, this.name, context, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}

/**
 * Attribute combined-pass findings to their declared domain and apply severity
 * penalties. Pure (no provider, no network) so it can be unit-tested directly.
 *
 * The model is instructed to set agentName per finding; if it omits one or
 * invents one, the finding is DROPPED rather than filed under a wrong domain —
 * a misattributed finding would distort the per-category score breakdown.
 */
// Economy-mode LLMs sometimes emit abbreviated or title-cased domain names.
// Case/whitespace/kebab normalization (below, via normalizeAgentName) covers
// 'Security' → 'security', 'Test Intelligence' / 'test-intelligence' /
// 'test_intelligence' → 'testIntelligence', 'Dead Code' / 'dead-code' →
// 'deadCode', etc. automatically for every multi-word domain. This table is
// only for roots that differ entirely from the canonical key, where no
// amount of whitespace/case normalization would help ('Architect' ≠
// 'architecture').
const AGENT_NAME_ALIASES: Record<string, string> = { architect: 'architecture' }

/** Strip whitespace/hyphens/underscores and lowercase, for fuzzy domain-name matching. */
function normalizeAgentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export function attributeFindings(
  findings: AgentFinding[],
  domains: DomainSpec[],
  provider?: string,
  model?: string
): AgentFinding[] {
  const validNames = new Set(domains.map((d) => d.name))

  const attributed: AgentFinding[] = []
  for (const f of findings) {
    // Normalize case/whitespace/kebab variants ('Test Intelligence' →
    // 'testIntelligence') then apply the alias table for roots that differ
    // entirely ('Architect' → 'architecture').
    if (!validNames.has(f.agentName)) {
      const norm = normalizeAgentName(f.agentName)
      const aliased = AGENT_NAME_ALIASES[norm]
      const canonical =
        Array.from(validNames).find((n) => normalizeAgentName(n) === norm) ??
        (aliased && validNames.has(aliased) ? aliased : undefined)
      if (canonical) f.agentName = canonical
    }
    if (!validNames.has(f.agentName)) {
      console.warn(
        chalk.yellow(
          `⚠ combined: dropped finding "${f.title}" with unrecognized agentName "${f.agentName}"`
        )
      )
      continue
    }
    f.provider = provider
    f.model = model
    // Intentionally left unset here (not baked from SEVERITY_PENALTY) so
    // calculateScore's configured severityWeights apply to economy-mode
    // findings the same way they do for parallel-mode specialist findings —
    // see base.ts's parseFindingsResponse for the equivalent comment.
    attributed.push(f)
  }
  return attributed
}
