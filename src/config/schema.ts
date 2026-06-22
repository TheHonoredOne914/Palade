import { z } from 'zod'

const ProviderConfigSchema = z.object({
  apiKey: z.string().default(''),
  apiKeys: z.array(z.string().min(1)).optional(),
  model: z.string().optional(),
  maxConcurrency: z.number().int().min(1).max(20).optional()
})

export const PaladeConfigSchema = z.object({
  providers: z.object({
    groq: ProviderConfigSchema.optional(),
    cerebras: ProviderConfigSchema.optional(),
    nvidia: ProviderConfigSchema.extend({
      baseUrl: z.string().url().optional()
    }).optional(),
    openrouter: ProviderConfigSchema.optional(),
    'opencode-zen': ProviderConfigSchema.optional()
  }),
  swarm: z.object({
    primary: z.enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen']).default('opencode-zen'),
    synthesis: z.enum(['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen']).default('nvidia'),
    agentCount: z.number().int().min(1).max(12).default(6),
    timeoutMs: z.number().int().default(600000),
    maxReviewTokens: z.number().int().min(10_000).default(200_000)
  }).default({}),
  output: z.object({
    dir: z.string().default('.palade/reports'),
    formats: z.array(z.enum(['html', 'json', 'md'])).default(['html', 'json']),
    openBrowser: z.boolean().default(true),
    port: z.number().int().default(4242)
  }).default({}),
  score: z.object({
    historyFile: z.string().default('.palade/history.json'),
    badge: z.boolean().default(true),
    badgePath: z.string().default('palade-badge.svg')
  }).default({})
})

export type PaladeConfig = z.infer<typeof PaladeConfigSchema>
