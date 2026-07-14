import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const PROVIDERS = [
  { id: 'groq', label: 'Groq', env: 'GROQ_API_KEY', model: 'openai/gpt-oss-120b' },
  { id: 'cerebras', label: 'Cerebras', env: 'CEREBRAS_API_KEY', model: 'gpt-oss-120b' },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    env: 'OPENROUTER_API_KEY',
    model: 'openrouter/free',
  },
  { id: 'nvidia', label: 'NVIDIA', env: 'NVIDIA_API_KEY', model: 'minimaxai/minimax-m3' },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    env: 'OPENCODE_ZEN_API_KEY',
    model: 'deepseek-v4-flash-free',
  },
  // Keyless — router.ts's instantiateProviders() treats a present `ollama`
  // config section as usable without an apiKey. `env` here is a best-effort
  // "is it configured" signal (matches launch.tsx/app.tsx's existing
  // OLLAMA_BASE_URL/OLLAMA_MODEL env checks), not a secret to save the way
  // every other provider's env var is (uicli-002/003).
  { id: 'ollama', label: 'Ollama', env: 'OLLAMA_BASE_URL', model: 'minimax-m2.5' },
] as const

export type ProviderId = (typeof PROVIDERS)[number]['id']

/**
 * Whether a provider has enough configuration to be considered "available"
 * in status displays (TUI provider dots, settings panel tabs). Every
 * provider except ollama needs a non-empty apiKey; ollama is keyless, so its
 * own config section merely being present counts — matches router.ts's
 * instantiateProviders() usable check (uicli-002/003).
 */
export function isProviderConfigured(
  providers: Record<string, { apiKey?: string } | undefined> | undefined,
  id: ProviderId
): boolean {
  const cfg = providers?.[id]
  if (id === 'ollama') return Boolean(cfg)
  return !!cfg?.apiKey
}

/**
 * Same precedence as config/loader.ts loadConfig(): `.palade/palade.config.ts`
 * first, then the root-level file. Writing to a different file than the one
 * loadConfig reads would save keys that are never picked up.
 */
export function resolveConfigPath(projectRoot: string): string {
  const nested = join(projectRoot, '.palade', 'palade.config.ts')
  if (existsSync(nested)) return nested
  return join(projectRoot, 'palade.config.ts')
}

/**
 * Brace-aware, comma-preserving writer for a dotted config path (e.g.
 * "swarm.primary" or "providers.groq.model") inside the plain-text
 * palade.config.ts. Shared by `palade settings --set` and the TUI settings
 * panel's provider/model/swarm selectors so both write the same way.
 */
// Keys like 'opencode-zen' aren't valid bare TS identifiers — quote them when
// writing new lines, or the emitted config file won't parse.
function quoteKeyIfNeeded(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`
}

export function setNestedValue(content: string, dotPath: string, value: unknown): string {
  const parts = dotPath.split('.')
  const valueStr =
    typeof value === 'string'
      ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : Array.isArray(value)
        ? `[${value.map((v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ')}]`
        : String(value)
  const lines = content.split('\n')

  // Walk the file tracking object nesting via { } so that a dotted path like
  // "providers.groq.model" resolves to the model key nested two levels deep,
  // NOT the first "model:" line found anywhere in the file.
  //
  // `pathStack` holds the ordered list of section keys we are currently inside
  // (e.g. ["providers", "groq"]). A key line "foo: {" pushes "foo"; a matching
  // closing brace pops it. When pathStack equals parts[0..n-2] and the current
  // line is "keyName:", that is the target.
  const pathStack: string[] = []
  // indents[i] = the indentation of the { that opened pathStack[i]
  const openIndents: number[] = []

  const keyName = parts[parts.length - 1]
  const escapedKey = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keyPattern = new RegExp(`^(\\s*)(?:['"]?${escapedKey}['"]?)\\s*:\\s*(.*)$`)
  // Matches "sectionKey: {" possibly with a trailing comment.
  const sectionOpenPattern = /^(\s*)(?:['"]?([A-Za-z_$][\w$-]*)['"]?)\s*:\s*\{/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    if (!trimmed || trimmed.startsWith('//')) {
      // braces inside comments/blank lines are ignored; nesting unchanged
      continue
    }

    // Closing brace: a single `}` always closes exactly the innermost open
    // section, regardless of its indentation — pop one level, not a
    // variable number based on an indent heuristic (which can over-pop
    // ancestors when a closer is indented to match a parent's open indent).
    if (trimmed.startsWith('}')) {
      if (openIndents.length > 0) {
        pathStack.pop()
        openIndents.pop()
      }
      continue
    }

    // Opening a new section: "name: {"
    const openMatch = sectionOpenPattern.exec(line)
    if (openMatch) {
      // A single-line nested object literal (e.g. `output: { dir: 'x' }`)
      // opens and closes its brace on the same line. Pushing a stack frame
      // for it that never gets popped would misattribute every subsequent
      // line as nested inside it, so only push when the brace stays open
      // past the end of this line.
      const openBraceIdx = line.indexOf('{', openMatch[1].length)
      const afterOpen = line.slice(openBraceIdx + 1)
      const opensInRest = (afterOpen.match(/\{/g) || []).length
      const closesInRest = (afterOpen.match(/\}/g) || []).length
      if (closesInRest > opensInRest) {
        continue
      }
      const indent = openMatch[1].length
      const sectionKey = openMatch[2]
      pathStack.push(sectionKey)
      openIndents.push(indent)
      continue
    }

    // A key: value line. Is this our target?
    const keyMatch = keyPattern.exec(line)
    if (keyMatch) {
      const targetPath = parts.slice(0, -1)
      const matchesPath =
        pathStack.length === targetPath.length && targetPath.every((p, idx) => pathStack[idx] === p)
      if (matchesPath) {
        // Preserve the trailing comma if the original line had one — without
        // this, "agentCount: 6," becomes "agentCount: 8" and breaks the object.
        const hadComma = /,\s*(\/\/.*)?$/.test(keyMatch[2])
        const trailingComma = hadComma ? ',' : ''
        lines[i] = `${keyMatch[1]}${quoteKeyIfNeeded(keyName)}: ${valueStr}${trailingComma}`
        return lines.join('\n')
      }
    }
  }

  // Key not found — insert it inside the deepest EXISTING section along the
  // path, creating any missing intermediate sections as a nested block (e.g.
  // "swarm.providerShares.groq" when providerShares: {} doesn't exist yet).
  const targetPath = parts.slice(0, -1)

  // Find the line index + indent of the closing brace of the section at
  // `path`, or null if that section doesn't exist. Same brace-walking rules
  // as the modify loop above.
  const findSectionClose = (path: string[]): [number, number] | null => {
    const pathStack2: string[] = []
    const openIndents2: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()
      if (!trimmed || trimmed.startsWith('//')) continue

      if (trimmed.startsWith('}')) {
        // If the section we are closing IS the target, insert here.
        if (pathStack2.length === path.length && path.every((p, idx) => pathStack2[idx] === p)) {
          return [i, openIndents2[openIndents2.length - 1] + 2]
        }
        if (openIndents2.length > 0) {
          pathStack2.pop()
          openIndents2.pop()
        }
        continue
      }

      const openMatch = /^(\s*)(?:['"]?([A-Za-z_$][\w$-]*)['"]?)\s*:\s*\{/.exec(line)
      if (openMatch) {
        // Same self-closing single-line-object guard as the modify loop above.
        const openBraceIdx = line.indexOf('{', openMatch[1].length)
        const afterOpen = line.slice(openBraceIdx + 1)
        const opensInRest = (afterOpen.match(/\{/g) || []).length
        const closesInRest = (afterOpen.match(/\}/g) || []).length
        if (closesInRest > opensInRest) {
          continue
        }
        pathStack2.push(openMatch[2])
        openIndents2.push(openMatch[1].length)
        continue
      }
    }
    return null
  }

  // The file's final closing brace is the "close" of the root object — the
  // section walker never pushes `export default {` itself, so path length 0
  // is handled separately here.
  const findRootClose = (): [number, number] | null => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') return [i, 2]
    }
    return null
  }

  // Longest existing prefix of targetPath wins; prefixLen === targetPath.length
  // means the parent exists and we just insert the key line.
  for (let prefixLen = targetPath.length; prefixLen >= 0; prefixLen--) {
    const loc = prefixLen === 0 ? findRootClose() : findSectionClose(targetPath.slice(0, prefixLen))
    if (!loc) continue
    const [insertAt, insertIndent] = loc

    const missing = targetPath.slice(prefixLen)
    const block: string[] = []
    missing.forEach((section, depth) =>
      block.push(`${' '.repeat(insertIndent + 2 * depth)}${quoteKeyIfNeeded(section)}: {`)
    )
    block.push(
      `${' '.repeat(insertIndent + 2 * missing.length)}${quoteKeyIfNeeded(keyName)}: ${valueStr}`
    )
    for (let depth = missing.length - 1; depth >= 0; depth--) {
      block.push(`${' '.repeat(insertIndent + 2 * depth)}},`)
    }

    // Ensure previous non-blank, non-comment line ends with a comma.
    for (let j = insertAt - 1; j >= 0; j--) {
      const prev = lines[j].trimEnd()
      if (prev && !prev.startsWith('//')) {
        if (!prev.endsWith(',') && !prev.endsWith('{') && !prev.endsWith('}')) {
          lines[j] = lines[j].trimEnd() + ','
        }
        break
      }
    }
    lines.splice(insertAt, 0, ...block)
    return lines.join('\n')
  }

  console.log(`  ⚠ Could not set ${dotPath} — edit .palade/palade.config.ts manually`)
  return content
}

/**
 * Persists a single dotted-path config value (e.g. "swarm.primary",
 * "providers.groq.model") to the resolved palade.config.ts. Used by the TUI
 * settings panel's swarm/synthesis/model selectors — same underlying writer
 * as `palade settings --set`.
 */
export async function saveConfigValues(
  projectRoot: string,
  updates: Record<string, unknown>
): Promise<void> {
  const configPath = resolveConfigPath(projectRoot)
  const paladeDir = join(projectRoot, '.palade')
  if (!existsSync(paladeDir)) await mkdir(paladeDir, { recursive: true })

  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch {
    content = `// palade.config.ts — managed by Palade TUI settings\nexport default {\n  providers: {},\n  swarm: {\n    primary: 'opencode-zen',\n    synthesis: 'nvidia',\n    agentCount: 8\n  },\n  output: { dir: '.palade/reports', formats: ['html', 'json'], openBrowser: true, port: 4242 },\n  score: { historyFile: '.palade/history.json', badge: true, badgePath: 'palade-badge.svg' }\n}\n`
  }

  for (const [dotPath, value] of Object.entries(updates)) {
    content = setNestedValue(content, dotPath, value)
  }
  await writeFile(configPath, content, 'utf-8')
}

export async function saveConfigValue(
  projectRoot: string,
  dotPath: string,
  value: unknown
): Promise<void> {
  return saveConfigValues(projectRoot, { [dotPath]: value })
}

export async function readCurrentKeys(projectRoot: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}

  for (const p of PROVIDERS) {
    if (process.env[p.env]) {
      result[p.id] = process.env[p.env]!
    }
  }

  try {
    const envPath = join(projectRoot, '.env')
    const envContent = await readFile(envPath, 'utf-8')
    for (const p of PROVIDERS) {
      if (!result[p.id]) {
        const envLineRe = new RegExp(`^${p.env}=(.*)$`, 'm')
        const match = envContent.match(envLineRe)
        if (match) result[p.id] = match[1]
      }
    }
  } catch {
    // .env file may not exist — that's fine, just skip it
  }

  const configPath = resolveConfigPath(projectRoot)
  if (!existsSync(configPath)) return result
  try {
    const content = await readFile(configPath, 'utf-8')
    for (const p of PROVIDERS) {
      if (result[p.id]) continue
      const re = new RegExp(`['"]?${p.id}['"]?:\\s*\\{[^{}]{0,200}?apiKey:\\s*['"]([^'"]+)['"]`)
      const m = content.match(re)
      if (m) result[p.id] = m[1]
    }
  } catch {
    /* ignore */
  }
  return result
}

/**
 * Single source of truth for "save an API key" — now only writes to .env
 * to prevent leaking secrets into version control.
 */
export async function saveApiKey(
  projectRoot: string,
  providerId: ProviderId,
  apiKey: string
): Promise<void> {
  const prov = PROVIDERS.find((p) => p.id === providerId)!
  const envKey = prov.env
  // Strip newlines — a key containing \n would inject extra .env lines.
  const safeKey = apiKey.replace(/[\r\n]/g, '')
  process.env[envKey] = safeKey

  const envPath = join(projectRoot, '.env')
  let envContent = ''
  try {
    envContent = await readFile(envPath, 'utf-8')
  } catch {
    // file doesn't exist yet, start fresh
  }
  const envLineRe = new RegExp(`^${envKey}=.*$`, 'm')
  const newLine = `${envKey}=${safeKey}`
  if (envLineRe.test(envContent)) {
    envContent = envContent.replace(envLineRe, newLine)
  } else {
    envContent = envContent ? `${envContent.trimEnd()}\n${newLine}\n` : `${newLine}\n`
  }
  await writeFile(envPath, envContent, 'utf-8')
}
