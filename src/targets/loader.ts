import { pathToFileURL } from 'node:url'
import { resolve, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { TargetDefinitionSchema, type TargetDefinition } from './schema.js'

const TARGETS_FILE = '.palade/palade.targets.ts'

export async function loadTargets(projectRoot: string): Promise<TargetDefinition[]> {
  const filePath = resolve(projectRoot, TARGETS_FILE)

  if (!existsSync(filePath)) {
    return []
  }

  let raw: unknown
  try {
    const fileUrl = pathToFileURL(filePath).href
    const mod = await import(fileUrl)
    raw = mod.default ?? mod
  } catch {
    console.warn(`[targets] Failed to import ${TARGETS_FILE}`)
    return []
  }

  if (!Array.isArray(raw)) {
    console.warn(`[targets] ${TARGETS_FILE} did not export an array`)
    return []
  }

  const targets: TargetDefinition[] = []
  for (let i = 0; i < raw.length; i++) {
    const result = TargetDefinitionSchema.safeParse(raw[i])
    if (result.success) {
      targets.push(result.data)
    } else {
      const issues = result.error.issues.map((iss) => iss.message).join(', ')
      console.warn(`[targets] Skipping target at index ${i}: ${issues}`)
    }
  }

  return targets
}

export function resolveTargetPaths(target: TargetDefinition, projectRoot: string): string[] {
  const entry = Array.isArray(target.entry) ? target.entry : [target.entry]
  return entry.map((p) => {
    const abs = resolve(projectRoot, p)
    return relative(projectRoot, abs).replace(/\\/g, '/')
  })
}
