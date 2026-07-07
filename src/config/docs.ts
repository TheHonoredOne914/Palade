import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type OptionalDocResult =
  { status: 'missing' } | { status: 'ok'; content: string } | { status: 'error' }

/** Reads an optional project doc (spec, constitution) relative to projectRoot. */
export function readOptionalProjectDoc(
  projectRoot: string,
  relativePath: string
): OptionalDocResult {
  const absolutePath = join(projectRoot, relativePath)
  if (!existsSync(absolutePath)) return { status: 'missing' }
  try {
    return { status: 'ok', content: readFileSync(absolutePath, 'utf-8') }
  } catch {
    return { status: 'error' }
  }
}
