import { z } from 'zod'
import {
  DEFAULT_BADGE_PATH,
  DEFAULT_CONSTITUTION_PATH,
  DEFAULT_SPEC_PATH,
  DEFAULT_CONFIG,
  SEVERITY_PENALTY,
  DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS,
  DEFAULT_PENALTY_CAPS,
} from './defaults.js'
import { BUILTIN_NAMES } from '../agents/registry.js'

export const ReportFormatSchema = z.enum(['html', 'json', 'md'])

// Single source of truth for provider IDs used in swarm config validation.
// Add new providers here; all five swarm fields below will pick it up.
const PROVIDER_ENUM = z.enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])

const ProviderConfigSchema = z.object({
  apiKey: z.string().default(''),
  apiKeys: z.array(z.string().min(1)).optional(),
  model: z.string().optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional(),
  // Optional per-provider overrides. baseUrl was previously only exposed for
  // nvidia/ollama; every adapter now accepts one (defaults to its hardcoded
  // URL when absent). timeoutMs threads into each adapter's request deadline.
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().min(1000).optional(),
  // openrouter-only: HTTP-Referer/X-Title headers OpenRouter uses for app
  // attribution. Previously hardcoded to a personal fork URL with no way to
  // override it (providers-006); default unchanged for callers who don't set
  // these. Silently ignored by every other adapter.
  referer: z.string().optional(),
  title: z.string().optional(),
})

export const PaladeConfigSchema = z
  .object({
    providers: z.object({
      groq: ProviderConfigSchema.optional(),
      cerebras: ProviderConfigSchema.optional(),
      nvidia: ProviderConfigSchema.optional(),
      openrouter: ProviderConfigSchema.optional(),
      'opencode-zen': ProviderConfigSchema.optional(),
      ollama: ProviderConfigSchema.optional(),
    }),
    swarm: z
      .object({
        primary: PROVIDER_ENUM.default('opencode-zen'),
        synthesis: PROVIDER_ENUM.default('nvidia'),
        triage: PROVIDER_ENUM.optional(),
        agentProviders: z
          .record(
            z.string(),
            PROVIDER_ENUM
          )
          .optional(),
        providerShares: z
          .record(
            PROVIDER_ENUM,
            z.number().int().min(0)
          )
          .optional(),
        // Max is BUILTIN_NAMES.length — only that many built-in specialist
        // agents exist. A higher configured value had no effect on the
        // actual swarm but still inflated ingestion/estimator.ts's cost math
        // by up to 50% (cli-001).
        agentCount: z.number().int().min(1).max(BUILTIN_NAMES.length).default(8),
        timeoutMs: z.number().int().default(600000),
        maxReviewTokens: z.number().int().min(10_000).default(200_000),
        // Economy mode sends each batch of code to ONE combined multi-domain call
        // (all specialists in a single prompt with domain-tagged output sections)
        // instead of N parallel per-domain calls. This cuts the ~6x resend of the
        // same chunk content across agents. Default false: the parallel swarm is
        // lower-latency and gives each domain its own dedicated system prompt, so
        // users opt into economy mode when token cost matters more than latency.
        economyMode: z.boolean().default(false),
        // Whether to append the built-in Ponytail/Karpathy/GStack skills block
        // (~3.5KB) to every agent's system prompt on every batch. Default true
        // keeps existing behavior; disable to save tokens if you don't rely on
        // those review lenses.
        includeSkills: z.boolean().default(true),
        specPath: z.string().default(DEFAULT_SPEC_PATH),
        constitutionPath: z.string().default(DEFAULT_CONSTITUTION_PATH),
        // Batch scheduling knobs, previously only internal.
        maxConcurrentBatches: z.number().int().min(1).default(5),
        softTokenLimit: z.number().int().min(1).default(16_000),
        hardChunkLimit: z.number().int().min(1).default(6_000),
        // Max findings (by severity) sent to the synthesis LLM. Previously
        // hardcoded in agents/synthesis.ts with no way for the sole caller
        // (swarm.ts) to actually override it.
        maxSynthesisFindings: z.number().int().min(1).default(50),
        // Timeout in ms for the synthesis provider call. Same "hardcoded with
        // no way to override" history as maxSynthesisFindings above.
        synthesisTimeoutMs: z.number().int().min(1000).default(180_000),
        // Retention cap for .palade/decisions/ ADR files (oldest pruned
        // first), unlike every other swarm cap previously not config-backed.
        decisionsRetentionLimit: z.number().int().min(1).default(100),
      })
      .default(() => ({ ...(DEFAULT_CONFIG.swarm as Record<string, unknown>) })),
    output: z
      .object({
        dir: z.string().default('.palade/reports'),
        formats: z.array(ReportFormatSchema).default(['html', 'json']),
        openBrowser: z.boolean().default(true),
        port: z.number().int().default(4242),
      })
      .default({}),
    score: z
      .object({
        historyFile: z.string().default('.palade/history.json'),
        badge: z.boolean().default(true),
        badgePath: z.string().default(DEFAULT_BADGE_PATH),
        // Retention cap for history.json entries (oldest trimmed first).
        // NOTE: applied PER-KIND, not to the combined file total — 'full' and
        // 'diff' entries each get their own retention budget of this size (see
        // history.ts's trimEntries), so history.json can grow to ~2x this
        // number. This is intentional (a flat combined cap let frequent `palade
        // diff` runs evict every 'full' entry and break score trend tracking)
        // but the field name doesn't make that obvious (scorer-003).
        maxHistoryEntries: z.number().int().min(1).default(50),
        // Per-finding penalty applied when calculating category/total scores,
        // keyed by severity. Defaults match agents/base.ts's SEVERITY_PENALTY.
        severityWeights: z
          .object({
            critical: z.number().default(SEVERITY_PENALTY.critical),
            high: z.number().default(SEVERITY_PENALTY.high),
            medium: z.number().default(SEVERITY_PENALTY.medium),
            low: z.number().default(SEVERITY_PENALTY.low),
            info: z.number().default(SEVERITY_PENALTY.info),
          })
          .default({}),
        // Base penalty per cross-agent conflict, keyed by severity, before the
        // blast-radius multiplier is applied.
        crossAgentPenalty: z
          .object({
            critical: z.number().default(DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS.critical),
            high: z.number().default(DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS.high),
            medium: z.number().default(DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS.medium),
          })
          .default({}),
        // Configurable complexity thresholds for the maintainability category.
        complexityPenalties: z
          .object({
            lowThreshold: z.number().int().min(0).default(5),
            lowFactor: z.number().default(0.5),
            highThreshold: z.number().int().min(0).default(20),
            highFactor: z.number().default(1.5),
          })
          .refine((v) => v.lowThreshold < v.highThreshold, {
            message: 'complexityPenalties.lowThreshold must be less than highThreshold',
          })
          .default({}),
        // Category/total penalty caps used when computing the final score.
        // Defaults match calculator.ts's previously-hardcoded constants.
        penaltyCaps: z
          .object({
            categoryPenaltyCap: z.number().default(DEFAULT_PENALTY_CAPS.categoryPenaltyCap),
            totalPenaltyCap: z.number().default(DEFAULT_PENALTY_CAPS.totalPenaltyCap),
          })
          .default({}),
      })
      .default({}),
  })
  .strict()

export type PaladeConfig = z.infer<typeof PaladeConfigSchema>
