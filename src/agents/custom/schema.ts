import { z } from 'zod'

/** Built-in agent names that cannot be overridden by custom agents. */
const BUILTIN_NAMES = [
  'security',
  'architecture',
  'performance',
  'maintainability',
  'deadCode',
  'testIntelligence',
] as const

export const CustomAgentDefinitionSchema = z.object({
  /** Unique agent name. Must not collide with built-in names. */
  name: z
    .string()
    .min(1)
    .refine((n) => !(BUILTIN_NAMES as readonly string[]).includes(n), {
      message: `Name collides with a built-in agent. Reserved names: ${BUILTIN_NAMES.join(', ')}`,
    }),
  /** Display label for the agent's domain (e.g. "API Design", "Database Queries"). */
  domain: z.string().min(1),
  /** System prompt template. Gets buildSystemPrompt context injection (diff, targets, annotations). */
  systemPrompt: z.string().min(1, 'systemPrompt is required — the agent needs instructions'),
  /** Optional per-severity score weight overrides. Falls back to SEVERITY_PENALTY. */
  severityPenalty: z
    .object({
      critical: z.number().min(0).optional(),
      high: z.number().min(0).optional(),
      medium: z.number().min(0).optional(),
      low: z.number().min(0).optional(),
      info: z.number().min(0).optional(),
    })
    .optional(),
})

export type CustomAgentDefinition = z.infer<typeof CustomAgentDefinitionSchema>
