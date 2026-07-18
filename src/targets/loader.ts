import { pathToFileURL } from 'node:url'
import { resolve, relative } from 'node:path'
import { existsSync } from 'node:fs'
import { TargetDefinitionSchema, type TargetDefinition } from './schema.js'

const TARGETS_FILE = '.palade/palade.targets.ts'
// Legacy location: early versions scaffolded targets at the project root.
// Still honored (with a nudge) when the .palade/ file is absent, so a root
// palade.targets.ts isn't silently ignored.
const LEGACY_TARGETS_FILE = 'palade.targets.ts'

export async function loadTargets(projectRoot: string): Promise<TargetDefinition[]> {
  let targetsFile = TARGETS_FILE
  let filePath = resolve(projectRoot, TARGETS_FILE)

  if (!existsSync(filePath)) {
    const legacyPath = resolve(projectRoot, LEGACY_TARGETS_FILE)
    if (!existsSync(legacyPath)) {
      return []
    }
    console.warn(
      `[targets] Using legacy root ${LEGACY_TARGETS_FILE} — move it to ${TARGETS_FILE} (the canonical location).`
    )
    targetsFile = LEGACY_TARGETS_FILE
    filePath = legacyPath
  }

  let raw: unknown
  try {
    const fileUrl = pathToFileURL(filePath).href
    const mod = await import(fileUrl)
    raw = mod.default ?? mod
  } catch {
    console.warn(`[targets] Failed to import ${targetsFile}`)
    return []
  }

  if (!Array.isArray(raw)) {
    console.warn(`[targets] ${targetsFile} did not export an array`)
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
