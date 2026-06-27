import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TargetDefinition } from './schema.js'

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search'
const NPM_REGISTRY_URL = 'https://registry.npmjs.org'
const REGISTRY_TIMEOUT_MS = 5000
const TARGETS_FILE = 'palade.targets.ts'

export interface RegistryTarget {
  name: string
  description: string
  version: string
  keywords: string[]
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function searchTargets(query: string): Promise<RegistryTarget[]> {
  const params = new URLSearchParams({
    text: query,
    size: '20'
  })

  let res: Response
  try {
    res = await fetchWithTimeout(`${NPM_SEARCH_URL}?${params.toString()}`, REGISTRY_TIMEOUT_MS)
  } catch {
    console.warn('[registry] npm registry search timed out or failed')
    return []
  }

  if (!res.ok) {
    console.warn(`[registry] npm search returned ${res.status}`)
    return []
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return []
  }

  const obj = data as Record<string, unknown>
  const objects = obj.objects as Array<Record<string, unknown>> | undefined
  if (!objects) return []

  const results: RegistryTarget[] = []
  for (const entry of objects) {
    const pkg = entry.package as Record<string, unknown> | undefined
    if (!pkg) continue
    if (typeof pkg.name !== 'string') continue
    const hasPaladeKeyword = Array.isArray(pkg.keywords) &&
      (pkg.keywords as string[]).some((k) => k === 'palade-target' || k === 'palade-targets')
    if (!pkg.name.startsWith('palade-target-') && !pkg.name.startsWith('@palade-targets/') && !hasPaladeKeyword) continue

    results.push({
      name: pkg.name,
      description: typeof pkg.description === 'string' ? pkg.description : '',
      version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
      keywords: Array.isArray(pkg.keywords) ? (pkg.keywords as string[]) : []
    })
  }

  return results
}

export async function getTargetFromRegistry(
  packageName: string
): Promise<TargetDefinition | null> {
  let res: Response
  try {
    res = await fetchWithTimeout(
      `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}/latest`,
      REGISTRY_TIMEOUT_MS
    )
  } catch {
    console.warn(`[registry] Failed to fetch ${packageName} from npm`)
    return null
  }

  if (!res.ok) {
    console.warn(`[registry] Package ${packageName} not found (${res.status})`)
    return null
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return null
  }

  const pkg = data as Record<string, unknown>
  const paladeTarget = pkg.paladeTarget as Record<string, unknown> | undefined
  if (!paladeTarget) {
    console.warn(`[registry] ${packageName} does not contain a "paladeTarget" field`)
    return null
  }

  const name = paladeTarget.name
  const description = paladeTarget.description
  const entry = paladeTarget.entry
  const focus = paladeTarget.focus

  if (typeof name !== 'string' || typeof description !== 'string') {
    console.warn(`[registry] ${packageName} paladeTarget missing required fields`)
    return null
  }

  return {
    name,
    description,
    entry: typeof entry === 'string' ? entry : Array.isArray(entry) ? entry : '.',
    focus: Array.isArray(focus) ? focus : undefined
  }
}

export function appendTargetToFile(
  projectRoot: string,
  target: TargetDefinition
): void {
  const filePath = resolve(projectRoot, TARGETS_FILE)

  if (!existsSync(filePath)) {
    console.warn(`[registry] ${TARGETS_FILE} not found. Run palade init first.`)
    return
  }

  const entryStr = Array.isArray(target.entry)
    ? JSON.stringify(target.entry)
    : `'${target.entry}'`

  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const lines: string[] = []
  lines.push(`{`)
  lines.push(`  name: '${esc(target.name)}',`)
  lines.push(`  description: '${esc(target.description)}',`)
  lines.push(`  entry: ${entryStr},`)
  if (target.focus && target.focus.length > 0) {
    lines.push(`  focus: ${JSON.stringify(target.focus)},`)
  }
  lines.push(`},`)

  const snippet = '\n' + lines.join('\n  ')

  const content = readFileSync(filePath, 'utf-8')
  const closingIndex = content.lastIndexOf(']')
  if (closingIndex === -1) {
    console.warn(`[registry] Could not find closing ']' in ${TARGETS_FILE}`)
    return
  }

  // Ensure the last entry before the closing bracket has a trailing comma
  const beforeClose = content.slice(0, closingIndex).trimEnd()
  const needsComma = beforeClose.length > 0 && !beforeClose.endsWith(',') && !beforeClose.endsWith('[') && !beforeClose.endsWith('{')

  const commaPrefix = needsComma ? ',' : ''
  const updated = content.slice(0, closingIndex) + commaPrefix + snippet + '\n' + content.slice(closingIndex)
  writeFileSync(filePath, updated, 'utf-8')
}
