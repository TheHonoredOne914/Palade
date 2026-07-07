import { z } from 'zod'
import {
  DEFAULT_BADGE_PATH,
  DEFAULT_CONSTITUTION_PATH,
  DEFAULT_SPEC_PATH,
  DEFAULT_CONFIG,
} from './defaults.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import { DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS } from '../scorer/calculator.js'

export const ReportFormatSchema = z.enum(['html', 'json', 'md'])

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
        primary: z
          .enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])
          .default('opencode-zen'),
        synthesis: z
          .enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])
          .default('nvidia'),
        // Optional cheap/fast tier for the triage ranking call (a single call
        // per run that just ranks file paths, not a deep review). Falls back
        // to `primary` when unset — see router.ts's initRouter.
        triage: z
          .enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])
          .optional(),
        agentCount: z.number().int().min(1).max(12).default(8),
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
