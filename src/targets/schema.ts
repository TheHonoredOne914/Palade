import { z } from 'zod'

export const TargetDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  entry: z.union([z.string(), z.array(z.string()).min(1)]),
  focus: z.array(z.string()).optional(),
  scope: z
    .object({
      dirs: z.array(z.string()).optional(),
      files: z.array(z.string()).optional(),
      globs: z.array(z.string()).optional(),
      annotationsOnly: z.boolean().optional()
    })
    .optional()
})

export type TargetDefinition = z.infer<typeof TargetDefinitionSchema>
