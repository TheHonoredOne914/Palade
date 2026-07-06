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
] as const

export type ProviderId = (typeof PROVIDERS)[number]['id']

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
export function setNestedValue(content: string, dotPath: string, value: unknown): string {
  const parts = dotPath.split('.')
  const valueStr =
    typeof value === 'string'
      ? `'${value.replace(/'/g, "\\'")}'`
      : Array.isArray(value)
        ? `[${value.map((v) => `'${String(v).replace(/'/g, "\\'")}'`).join(', ')}]`
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
        lines[i] = `${keyMatch[1]}${keyName}: ${valueStr}${trailingComma}`
        return lines.join('\n')
      }
    }
  }

  // Key not found — insert it inside the target parent section (creating
  // intermediate sections as needed).
  const parentParts = parts.slice(0, -1)
  // Re-scan to find the closing brace of the deepest existing section along
  // the path so we can insert just before it.
  const targetPath = parentParts
  let insertAt = -1
  let insertIndent = 2

  if (targetPath.length === 0) {
    // Top-level key (dotPath has no '.'): the section-tracking loop below
    // never pushes the root `export default {` itself (it only matches
    // `key: {` lines), so it can never "close" the root and would leave a
    // top-level --set silently no-op. Insert directly before the file's
    // final closing brace instead.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') {
        insertAt = i
        break
      }
    }
  } else {
    const pathStack2: string[] = []
    const openIndents2: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()
      if (!trimmed || trimmed.startsWith('//')) continue

      if (trimmed.startsWith('}')) {
        const indent = line.length - trimmed.length
        while (openIndents2.length > 0 && openIndents2[openIndents2.length - 1] >= indent) {
          // If the section we are closing IS the target parent, insert here.
          if (
            pathStack2.length === targetPath.length &&
            targetPath.every((p, idx) => pathStack2[idx] === p)
          ) {
            insertAt = i
            insertIndent = indent + 2
            break
          }
          pathStack2.pop()
          openIndents2.pop()
        }
        if (insertAt !== -1) break
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
  }

  if (insertAt !== -1) {
    const insertLine = `${' '.repeat(insertIndent)}${keyName}: ${valueStr}`
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
    lines.splice(insertAt, 0, insertLine)
    return lines.join('\n')
  }

  // The parent section itself doesn't exist anywhere in the file yet (e.g.
  // "swarm" is fully commented out in the CONFIG_TEMPLATE, or absent). Create
  // it fresh as a new top-level block right before the file's final closing
  // brace. Only handles a single missing level (targetPath.length === 1) —
  // every dotted path this writer is used for (swarm.*, providers.<id>.*) has
  // a top-level parent, so a deeper missing-ancestor case doesn't arise here.
  if (targetPath.length === 1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === '}') {
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trimEnd()
          if (prev && !prev.startsWith('//')) {
            if (!prev.endsWith(',') && !prev.endsWith('{') && !prev.endsWith('}')) {
              lines[j] = lines[j].trimEnd() + ','
            }
            break
          }
        }
        lines.splice(i, 0, `  ${targetPath[0]}: {`, `    ${keyName}: ${valueStr}`, `  },`)
        return lines.join('\n')
      }
    }
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
export async function saveConfigValue(
  projectRoot: string,
  dotPath: string,
  value: unknown
): Promise<void> {
  const configPath = resolveConfigPath(projectRoot)
  const paladeDir = join(projectRoot, '.palade')
  if (!existsSync(paladeDir)) await mkdir(paladeDir, { recursive: true })

  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch {
    content = `// palade.config.ts — managed by Palade TUI settings\nexport default {\n  providers: {},\n  swarm: {\n    primary: 'opencode-zen',\n    synthesis: 'nvidia',\n    agentCount: 6\n  },\n  output: { dir: '.palade/reports', formats: ['html', 'json'], openBrowser: true, port: 4242 },\n  score: { historyFile: '.palade/history.json', badge: true, badgePath: 'palade-badge.svg' }\n}\n`
  }

  content = setNestedValue(content, dotPath, value)
  await writeFile(configPath, content, 'utf-8')
}

export async function readCurrentKeys(projectRoot: string): Promise<Record<string, string>> {
  const configPath = resolveConfigPath(projectRoot)
  const result: Record<string, string> = {}
  if (!existsSync(configPath)) return result
  try {
    const content = await readFile(configPath, 'utf-8')
    for (const p of PROVIDERS) {
      const re = new RegExp(`${p.id}[\\s\\S]{0,200}?apiKey:\\s*['"]([^'"]+)['"]`)
      const m = content.match(re)
      if (m) result[p.id] = m[1]
    }
  } catch {
    /* ignore */
  }
  return result
}

/**
 * Single source of truth for "save an API key" — writes to both
 * palade.config.ts AND .env so every entry point (TUI settings panel, CLI
 * `settings` command) leaves the config in the same resulting state.
 */
export async function saveApiKey(
  projectRoot: string,
  providerId: ProviderId,
  apiKey: string
): Promise<void> {
  const configPath = resolveConfigPath(projectRoot)
  const paladeDir = join(projectRoot, '.palade')
  if (!existsSync(paladeDir)) await mkdir(paladeDir, { recursive: true })

  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch {
    content = `// palade.config.ts — managed by Palade TUI settings\nexport default {\n  providers: {},\n  swarm: {\n    primary: '${providerId}',\n    synthesis: '${providerId}',\n    agentCount: 6\n  },\n  output: { dir: '.palade/reports', formats: ['html', 'json'], openBrowser: true, port: 4242 },\n  score: { historyFile: '.palade/history.json', badge: true, badgePath: 'palade-badge.svg' }\n}\n`
  }

  const prov = PROVIDERS.find((p) => p.id === providerId)!
  const escapedApiKey = apiKey
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  const updateRe = new RegExp(`(${providerId}[\\s\\S]{0,200}?apiKey:\\s*)(['"])([^'"]*)(\\2)`)
  if (updateRe.test(content)) {
    content = content.replace(
      updateRe,
      (_match, p1, p2, _p3, p4) => `${p1}${p2}${escapedApiKey}${p4}`
    )
  } else {
    const provBlock = `    '${providerId}': {\n      apiKey: '${escapedApiKey}',\n      model: '${prov.model}'\n    },\n`
    const providersRe = /(providers\s*:\s*\{)/
    if (providersRe.test(content)) {
      content = content.replace(providersRe, `$1\n${provBlock}`)
    } else {
      const exportRe = /(export default\s*\{)/
      if (!exportRe.test(content)) {
        throw new Error(`Could not find an insertion point in ${configPath}`)
      }
      content = content.replace(exportRe, `$1\n  providers: {\n${provBlock}  },`)
    }
  }

  await writeFile(configPath, content, 'utf-8')

  // Also persist to .env so dotenv picks it up on next launch, and inject
  // into process.env immediately so this session uses the key right away.
  const envKey = prov.env
  process.env[envKey] = apiKey

  const envPath = join(projectRoot, '.env')
  let envContent = ''
  try {
    envContent = await readFile(envPath, 'utf-8')
  } catch {
    // file doesn't exist yet, start fresh
  }
  const envLineRe = new RegExp(`^${envKey}=.*$`, 'm')
  const newLine = `${envKey}=${apiKey}`
  if (envLineRe.test(envContent)) {
    envContent = envContent.replace(envLineRe, newLine)
  } else {
    envContent = envContent ? `${envContent.trimEnd()}\n${newLine}\n` : `${newLine}\n`
  }
  await writeFile(envPath, envContent, 'utf-8')
}
