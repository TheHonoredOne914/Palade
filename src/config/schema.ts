import { z } from 'zod'

const ProviderConfigSchema = z.object({
  apiKey: z.string().default(''),
  apiKeys: z.array(z.string().min(1)).optional(),
  model: z.string().optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional(),
})

export const PaladeConfigSchema = z.object({
  providers: z.object({
    groq: ProviderConfigSchema.optional(),
    cerebras: ProviderConfigSchema.optional(),
    nvidia: ProviderConfigSchema.extend({
      baseUrl: z.string().url().optional(),
    }).optional(),
    openrouter: ProviderConfigSchema.optional(),
    'opencode-zen': ProviderConfigSchema.optional(),
    ollama: ProviderConfigSchema.extend({
      baseUrl: z.string().url().optional(),
    }).optional(),
  }),
  swarm: z
    .object({
      primary: z
        .enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])
        .default('opencode-zen'),
      synthesis: z
        .enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen', 'ollama'])
        .default('nvidia'),
      agentCount: z.number().int().min(1).max(12).default(6),
      timeoutMs: z.number().int().default(600000),
      maxReviewTokens: z.number().int().min(10_000).default(200_000),
      // Economy mode sends each batch of code to ONE combined multi-domain call
      // (all specialists in a single prompt with domain-tagged output sections)
      // instead of N parallel per-domain calls. This cuts the ~6x resend of the
      // same chunk content across agents. Default false: the parallel swarm is
      // lower-latency and gives each domain its own dedicated system prompt, so
      // users opt into economy mode when token cost matters more than latency.
      economyMode: z.boolean().default(false),
      specPath: z.string().default('palade.spec.md'),
      constitutionPath: z.string().default('.palade/constitution.md'),
    })
    .default({}),
  output: z
    .object({
      dir: z.string().default('.palade/reports'),
      formats: z.array(z.enum(['html', 'json', 'md'])).default(['html', 'json']),
      openBrowser: z.boolean().default(true),
      port: z.number().int().default(4242),
    })
    .default({}),
  score: z
    .object({
      historyFile: z.string().default('.palade/history.json'),
      badge: z.boolean().default(true),
      badgePath: z.string().default('palade-badge.svg'),
      // Retention cap for history.json entries (oldest trimmed first).
      maxHistoryEntries: z.number().int().min(1).default(50),
      // Per-finding penalty applied when calculating category/total scores,
      // keyed by severity. Defaults match agents/base.ts's SEVERITY_PENALTY.
      severityWeights: z
        .object({
          critical: z.number().default(10),
          high: z.number().default(5),
          medium: z.number().default(2),
          low: z.number().default(0.5),
          info: z.number().default(0),
        })
        .default({}),
      // Base penalty per cross-agent conflict, keyed by severity, before the
      // blast-radius multiplier is applied.
      crossAgentPenalty: z
        .object({
          critical: z.number().default(15),
          high: z.number().default(8),
          medium: z.number().default(4),
        })
        .default({}),
    })
    .default({}),
})

export type PaladeConfig = z.infer<typeof PaladeConfigSchema>
