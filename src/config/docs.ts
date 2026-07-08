import { existsSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

export type OptionalDocResult =
  { status: 'missing' } | { status: 'ok'; content: string } | { status: 'error' }

/** Reads an optional project doc (spec, constitution) relative to projectRoot. */
export function readOptionalProjectDoc(
  projectRoot: string,
  relativePath: string
): OptionalDocResult {
  const absolutePath = join(projectRoot, relativePath)
  // Guard against path traversal — a configured specPath/constitutionPath like
  // "../../../etc/passwd" must not escape projectRoot and get its contents
  // injected into every agent system prompt sent to third-party LLMs.
  if (absolutePath !== projectRoot && !absolutePath.startsWith(projectRoot + sep)) {
    console.warn(`[config] Ignoring doc path that escapes the project root: ${relativePath}`)
    return { status: 'missing' }
  }
  if (!existsSync(absolutePath)) return { status: 'missing' }
  try {
    return { status: 'ok', content: readFileSync(absolutePath, 'utf-8') }
  } catch {
    return { status: 'error' }
  }
}
