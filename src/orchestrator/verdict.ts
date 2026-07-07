import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { readdir, readFile, unlink, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { z } from 'zod'
import { getProvider } from '../providers/router.js'
import type { AgentFinding, AgentContext } from '../agents/base.js'
import type { ChangedFile } from '../diff/types.js'

export interface Conflict {
  filePath: string
  lineStart: number
  lineEnd: number
  sideA: AgentFinding
  sideB: AgentFinding
  /**
   * How confident the cheap keyword-based valence tally is that this is a
   * real conflict — informational only. 'high' means the tally itself found
   * clear opposite harden/relax signals; 'low' covers near-ties, one-sided
   * signals, and pairs with no keyword signal at all. Every entry here still
   * gets sent to the LLM for arbitration — the tally is only used upstream
   * (in detectConflicts) to skip pairs it's confident actually AGREE, not to
   * decide what counts as a conflict.
   */
  confidence: 'low' | 'high'
}

export interface Verdict {
  is_conflict: boolean
  decision: string
  tradeoff_accepted: string
  confidence: number
  losing_side: string
}

const HARDEN_KEYWORDS = [
  'add',
  'throttle',
  'encrypt',
  'validate',
  'lock',
  'strict',
  'check',
  'boundary',
  'limit',
  'ensure',
  'harden',
  'guard',
  'require',
  'prevent',
  'enforce',
  'sanitize',
  'escape',
  'restrict',
  'fail-safe',
  'timeout',
  'reject',
  'deny',
  'authenticate',
  'authorize',
]

const RELAX_KEYWORDS = [
  'remove',
  'skip',
  'fast-path',
  'relax',
  'bypass',
  'inline',
  'delete',
  'cache',
  'memoize',
  'omit',
  'drop',
  'ignore',
  'simplify',
  'fast',
  'assume',
  'allow',
  'permit',
  'shortcut',
  'optimize',
  'lazy',
  'defer',
  'speed',
  'permissive',
]

interface ValenceResult {
  valence: 'harden' | 'relax' | 'neutral'
  /** abs(hardenHits - relaxHits) — how close the keyword tally was. */
  margin: number
}

// Pre-compile keyword regexes once at module scope — whole-word matches only
// to avoid miscounting common fragments ('add' in "address", 'key' in "monkey").
const HARDEN_REGEXES = HARDEN_KEYWORDS.map((w) => new RegExp(`\\b${w}\\b`))
const RELAX_REGEXES = RELAX_KEYWORDS.map((w) => new RegExp(`\\b${w}\\b`))

function getValence(text: string): ValenceResult {
  const t = text.toLowerCase()
  let hardenHits = 0
  let relaxHits = 0

  for (const re of HARDEN_REGEXES) {
    if (re.test(t)) hardenHits++
  }
  for (const re of RELAX_REGEXES) {
    if (re.test(t)) relaxHits++
  }
  const margin = Math.abs(hardenHits - relaxHits)
  if (hardenHits > relaxHits) return { valence: 'harden', margin }
  if (relaxHits > hardenHits) return { valence: 'relax', margin }
  return { valence: 'neutral', margin }
}

// A margin of 1 (e.g. 2 harden hits vs 1 relax hit) is close enough that the
// harden/relax call could easily flip on a slightly different wording — treat
// conflicts built from such a near-tie as low confidence.
const NEAR_TIE_MARGIN = 1

export function detectConflicts(findings: AgentFinding[]): Conflict[] {
  const conflicts: Conflict[] = []
  const grouped = new Map<string, AgentFinding[]>()

  for (const f of findings) {
    if (!f.filePath || f.lineStart === undefined || f.lineEnd === undefined) continue
    const list = grouped.get(f.filePath) ?? []
    list.push(f)
    grouped.set(f.filePath, list)
  }

  for (const [filePath, fileFindings] of grouped.entries()) {
    for (let i = 0; i < fileFindings.length; i++) {
      const a = fileFindings[i]
      for (let j = i + 1; j < fileFindings.length; j++) {
        const b = fileFindings[j]

        // Must be from different agents
        if (a.agentName === b.agentName) continue

        // Check line overlap with a small adjacency window (5 lines). Two
        // findings are "overlapping" if their line ranges are within 5 lines of
        // each other — this catches near-misses from slightly different chunk
        // boundaries. The adjacency check must be symmetric to avoid false
        // positives where only one side is near the other but not vice versa.
        const gap = Math.max(a.lineStart! - b.lineEnd!, b.lineStart! - a.lineEnd!, 0)
        const overlap = gap <= 5

        if (!overlap) continue

        const valA = getValence(a.title + ' ' + a.description)
        const valB = getValence(b.title + ' ' + b.description)

        const opposite =
          (valA.valence === 'harden' && valB.valence === 'relax') ||
          (valA.valence === 'relax' && valB.valence === 'harden')
        const nearTie = valA.margin <= NEAR_TIE_MARGIN || valB.margin <= NEAR_TIE_MARGIN

        conflicts.push({
          filePath,
          lineStart: Math.min(a.lineStart!, b.lineStart!),
          lineEnd: Math.max(a.lineEnd!, b.lineEnd!),
          sideA: a,
          sideB: b,
          // 'high' only when the keyword tally itself clearly signals a
          // contradiction; everything else is 'low' but still arbitrated.
          confidence: opposite && !nearTie ? 'high' : 'low',
        })
      }
    }
  }

  return conflicts
}

const VerdictSchema = z.object({
  is_conflict: z
    .boolean()
    .describe(
      'True ONLY if the two recommendations are mutually exclusive and cannot both be applied.'
    ),
  decision: z
    .string()
    .describe('What to actually do (if conflict) or how to combine them (if no conflict)'),
  tradeoff_accepted: z.string().describe('The explicit cost being accepted'),
  confidence: z.coerce.number().describe('0-100 score of how confident you are in this tradeoff'),
  losing_side: z.string().describe('Which agent recommendation was NOT taken, and why (or N/A)'),
})

export async function arbitrateConflict(
  conflict: Conflict,
  context: AgentContext,
  signal?: AbortSignal
): Promise<Verdict | null> {
  let systemPrompt = `You are the Lead Architect. Two specialized agents have flagged the same piece of code.
Your first job is to determine if their recommendations actually contradict each other (mutually exclusive).
If they do NOT conflict (e.g., they address different aspects of the same lines, or both can be implemented), set is_conflict to false.
If they DO conflict, resolve the conflict by making a definitive architectural decision. Accept a tradeoff explicitly.

Respond ONLY with JSON matching this schema:
{
  "is_conflict": true,
  "decision": "string (what to actually do)",
  "tradeoff_accepted": "string (the explicit cost being accepted)",
  "confidence": 85,
  "losing_side": "string (which agent's recommendation was NOT taken, and why)"
}`

  // Ground the arbitration in the same project context specialist agents get
  // via buildSystemPrompt, so the verdict doesn't ignore the project's spec,
  // constitution, or subsystem focus.
  if (context.targetFocus?.length) {
    systemPrompt += `\n\nFOCUS AREAS: ${context.targetFocus.join(', ')}`
  }
  if (context.spec) {
    systemPrompt += `\n\nLOGIC SPEC:\n${context.spec}`
  }
  if (context.constitution) {
    systemPrompt += `\n\nAGENT CONSTITUTION (BEHAVIORAL GUIDELINES):\n${context.constitution}`
  }

  const userPrompt = `Agent [${conflict.sideA.agentName}] says:
Title: ${conflict.sideA.title}
Reasoning: ${conflict.sideA.description}

Agent [${conflict.sideB.agentName}] says:
Title: ${conflict.sideB.title}
Reasoning: ${conflict.sideB.description}

Please provide your verdict.`

  try {
    const provider = getProvider('synthesis')
    const response = await provider.complete({
      systemPrompt,
      userPrompt,
      // 4096 gives the model enough headroom to finish the JSON verdict
      // without truncating mid-object — a truncated response fails JSON.parse
      // below and the whole verdict is silently dropped.
      maxTokens: 4096,
      temperature: 0.1,
      signal,
    })
    const rawOutput = response.content ?? ''
    const trimmed = rawOutput.trim()
    let jsonStr = trimmed
    try {
      JSON.parse(trimmed)
    } catch {
      // Brace-depth parser as fallback for preamble
      let depth = 0
      let start = -1
      for (let i = 0; i < trimmed.length; i++) {
        if (trimmed[i] === '{') {
          if (depth === 0) start = i
          depth++
        } else if (trimmed[i] === '}') {
          depth--
          if (depth === 0 && start !== -1) {
            jsonStr = trimmed.slice(start, i + 1)
            break
          }
        }
      }
    }
    const parsed = JSON.parse(jsonStr)
    return VerdictSchema.parse(parsed)
  } catch (err) {
    console.warn(
      chalk.yellow(
        `\n[verdict] Arbitration failed for ${conflict.filePath}: ${err instanceof Error ? err.message : String(err)}`
      )
    )
    return null
  }
}

export async function saveDecision(
  projectRoot: string,
  conflict: Conflict,
  verdict: Verdict
): Promise<string> {
  const slugBase =
    conflict.filePath
      .split('/')
      .pop()
      ?.replace(/\.[^/.]+$/, '') || 'decision'
  const hash = crypto
    .createHash('md5')
    .update(conflict.filePath + conflict.lineStart + verdict.decision)
    .digest('hex')
    .slice(0, 6)
  const slug = `${slugBase}-${hash}`
  const dateStr = new Date().toISOString().split('T')[0]

  const markdown = `# ${slug}

**Date:** ${dateStr}
**File:** ${conflict.filePath}:${conflict.lineStart}-${conflict.lineEnd}
**Status:** Accepted

## Conflict
- **${conflict.sideA.agentName}:** ${conflict.sideA.title} - ${conflict.sideA.description}
- **${conflict.sideB.agentName}:** ${conflict.sideB.title} - ${conflict.sideB.description}

## Decision
${verdict.decision}

## Tradeoff accepted
${verdict.tradeoff_accepted}

## Losing side
${verdict.losing_side}

## Confidence
${verdict.confidence}%
`

  const MAX_DECISIONS = 100
  const dir = join(projectRoot, '.palade', 'decisions')
  await mkdir(dir, { recursive: true })
  const existingFiles = await readdir(dir).catch(() => [] as string[])
  const mdFiles = existingFiles.filter((f) => f.endsWith('.md'))
  if (mdFiles.length >= MAX_DECISIONS) {
    // Sort by actual file mtime (oldest first), not filename, so the cap
    // reliably prunes the oldest decisions rather than an alphabetical slice.
    const withMtimes = await Promise.all(
      mdFiles.map(async (f) => {
        const stats = await stat(join(dir, f)).catch(() => null)
        return { f, mtime: stats?.mtimeMs ?? 0 }
      })
    )
    withMtimes.sort((a, b) => a.mtime - b.mtime)
    const toDelete = withMtimes.slice(0, mdFiles.length - MAX_DECISIONS + 1).map((x) => x.f)
    await Promise.all(toDelete.map((f) => unlink(join(dir, f)).catch(() => {})))
  }
  const filepath = join(dir, `${slug}.md`)
  await writeFile(filepath, markdown, 'utf-8')

  return slug
}

export async function checkDecisionDrift(
  projectRoot: string,
  changedFiles: ChangedFile[]
): Promise<string[]> {
  const dir = join(projectRoot, '.palade', 'decisions')
  if (!existsSync(dir)) return []

  const files = await readdir(dir)
  const mdFiles = files.filter((f) => f.endsWith('.md'))
  if (mdFiles.length === 0) return []

  // Build map of diff additions by file
  const addedByPath = new Map<string, number[]>()
  for (const cf of changedFiles) {
    if (cf.diff && cf.status !== 'deleted') {
      const lines: number[] = []
      let headLine = 0
      for (const line of cf.diff.split('\n')) {
        if (line.startsWith('@@')) {
          const match = line.match(/\+(\d+)/)
          if (match) headLine = parseInt(match[1], 10)
          continue
        }
        if (line.startsWith('+++ ') || line.startsWith('--- ')) continue
        if (line.startsWith('+')) {
          lines.push(headLine)
          headLine++
        } else if (!line.startsWith('-')) {
          headLine++
        }
      }
      addedByPath.set(cf.path, lines)
    }
  }

  const warnings: string[] = []

  for (const file of mdFiles) {
    const content = await readFile(join(dir, file), 'utf-8')
    const match = content.match(/\*\*File:\*\*\s+(.+):(\d+)-(\d+)/)
    if (!match) continue

    const decisionPath = match[1]
    const start = parseInt(match[2], 10)
    const end = parseInt(match[3], 10)

    const editedLines = addedByPath.get(decisionPath)
    if (!editedLines) continue

    const overlaps = editedLines.some((l) => l >= start && l <= end)
    if (!overlaps) continue

    // There is an overlap! Trigger LLM check to see if it violates
    const cf = changedFiles.find((c) => c.path === decisionPath)
    if (!cf || !cf.diff) continue

    const systemPrompt = `You are Drift Watcher.
A user is making changes to a file that has a documented architectural decision.
Does their git diff violate the accepted decision?
Respond with ONLY "YES" or "NO".`

    const userPrompt = `DECISION DOCUMENT:
${content}

GIT DIFF:
${cf.diff}`

    try {
      const result = await getProvider('primary').complete({
        systemPrompt,
        userPrompt,
        maxTokens: 8,
        temperature: 0.1,
      })

      if ((result.content ?? '').trim().toUpperCase().includes('YES')) {
        warnings.push(`You're editing logic that contradicts a documented decision (${file}).`)
      }
    } catch {
      // ignore LLM failure in watch mode
    }
  }

  return warnings
}
