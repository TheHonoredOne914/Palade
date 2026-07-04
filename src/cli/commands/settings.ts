import chalk from 'chalk'
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { theme } from '../../ui/theme.js'
import { loadConfig } from '../../config/loader.js'
import { CliExitError } from '../../errors/types.js'
import { askConfirm, askList, askQuestion } from '../../ui/prompt.js'
import { CONFIG_TEMPLATE, IGNORE_TEMPLATE } from './init.js'

interface SettingsOptions {
  set?: string[]
  init?: boolean
  list?: boolean
}

export async function settingsCommand(opts: SettingsOptions): Promise<void> {
  const projectRoot = process.cwd()

  if (opts.init) {
    await initConfig(projectRoot)
    return
  }

  if (opts.set && opts.set.length > 0) {
    await applySets(projectRoot, opts.set)
    return
  }

  if (opts.list) {
    await showCurrentConfig(projectRoot)
    return
  }

  if (!opts.set && !opts.list && !opts.init) {
    await interactiveSettings(projectRoot)
    return
  }

  await showCurrentConfig(projectRoot)
}

async function interactiveSettings(projectRoot: string): Promise<void> {
  await showCurrentConfig(projectRoot)

  console.log()
  const wantsApi = await askConfirm('Do you want to configure an API key for a provider?', true)
  if (!wantsApi) {
    return
  }

  const providers = ['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen']
  const provider = await askList('Select a provider:', providers)

  const key = await askQuestion(`Enter your API key for ${provider}: `)
  if (!key.trim()) {
    console.log(theme.dim('No key provided. Cancelled.'))
    return
  }

  const envPath = join(projectRoot, '.env')
  const envVar = `${provider.toUpperCase().replace('-', '_')}_API_KEY`

  await appendFile(envPath, `\n${envVar}=${key.trim()}\n`, 'utf-8')
  console.log(theme.success(`\n  ✓ Saved ${envVar} to .env\n`))
}

async function showCurrentConfig(projectRoot: string): Promise<void> {
  console.log()
  console.log(theme.bold('  Palade Settings'))
  console.log(theme.dim('  ─────────────────────────────────'))

  try {
    const config = await loadConfig()

    console.log()
    console.log(theme.bold('  Providers:'))

    const providers = ['groq', 'cerebras', 'nvidia', 'openrouter', 'opencode-zen'] as const
    for (const name of providers) {
      const p = (config.providers as Record<string, { apiKey?: string; model?: string }>)[name]
      if (p) {
        const keyStatus = p.apiKey ? chalk.green('● set') : chalk.red('○ not set')
        const model = p.model ? chalk.dim(` (${p.model})`) : ''
        console.log(`    ${theme.accent('◆')} ${name.padEnd(14)} ${keyStatus}${model}`)
      }
    }

    console.log()
    console.log(theme.bold('  Swarm:'))
    console.log(`    Primary:    ${chalk.cyan(config.swarm?.primary ?? 'opencode-zen')}`)
    console.log(`    Synthesis:  ${chalk.cyan(config.swarm?.synthesis ?? 'nvidia')}`)
    console.log(`    Agents:     ${chalk.cyan(String(config.swarm?.agentCount ?? 6))}`)
    console.log(`    Timeout:    ${chalk.cyan(String(config.swarm?.timeoutMs ?? 600000))}ms`)

    if (config.output) {
      console.log()
      console.log(theme.bold('  Output:'))
      console.log(
        `    Formats:    ${chalk.cyan(config.output.formats?.join(', ') ?? 'html, json')}`
      )
      console.log(`    Directory:  ${chalk.cyan(config.output.dir ?? '.palade/reports')}`)
      console.log(
        `    Browser:    ${chalk.cyan(config.output.openBrowser !== false ? 'auto-open' : 'disabled')}`
      )
    }

    if (config.score) {
      console.log()
      console.log(theme.bold('  Score:'))
      console.log(
        `    History:    ${chalk.cyan(config.score.historyFile ?? '.palade/history.json')}`
      )
      console.log(
        `    Badge:      ${chalk.cyan(config.score.badge !== false ? 'enabled' : 'disabled')}`
      )
    }
  } catch {
    console.log()
    console.log(theme.dim('  No config found. Run:'))
    console.log()
    console.log(chalk.cyan('    palade settings --init'))
    console.log()
  }

  console.log()
  console.log(theme.bold('  Usage:'))
  console.log()
  console.log(chalk.cyan('    palade settings --set swarm.primary=groq'))
  console.log(chalk.cyan('    palade settings --set swarm.agentCount=8'))
  console.log(chalk.cyan('    palade settings --set output.openBrowser=false'))
  console.log(chalk.cyan('    palade settings --init'))
  console.log()
}

async function initConfig(projectRoot: string): Promise<void> {
  const configPath = join(projectRoot, '.palade', 'palade.config.ts')
  const ignorePath = join(projectRoot, '.palade', 'ignore')

  if (!existsSync(join(projectRoot, '.palade'))) {
    await mkdir(join(projectRoot, '.palade'), { recursive: true })
  }

  if (!existsSync(configPath)) {
    await writeFile(configPath, CONFIG_TEMPLATE, 'utf-8')
    console.log(theme.success('  ✓ .palade/palade.config.ts created'))
  } else {
    console.log(theme.dim('  .palade/palade.config.ts already exists, skipping'))
  }

  if (!existsSync(ignorePath)) {
    await writeFile(ignorePath, IGNORE_TEMPLATE, 'utf-8')
    console.log(theme.success('  ✓ .palade/ignore created'))
  } else {
    console.log(theme.dim('  .palade/ignore already exists, skipping'))
  }

  console.log()
  console.log(theme.success('  ✓ Config initialized. Set your API key:'))
  console.log()
  console.log(chalk.cyan('    export GROQ_API_KEY=YOUR_KEY'))
  console.log()
}

async function applySets(projectRoot: string, sets: string[]): Promise<void> {
  const configPath = join(projectRoot, '.palade', 'palade.config.ts')
  let configContent: string

  try {
    configContent = await readFile(configPath, 'utf-8')
  } catch {
    console.error(chalk.red('  Config not found. Run: palade settings --init'))
    throw new CliExitError(1)
  }

  for (const set of sets) {
    const eqIdx = set.indexOf('=')
    if (eqIdx === -1) {
      console.error(chalk.red(`  Invalid format: ${set} (expected key=value)`))
      continue
    }

    const key = set.slice(0, eqIdx).trim()
    const rawValue = set.slice(eqIdx + 1).trim()
    const value = parseValue(rawValue)

    const old = configContent
    configContent = setNestedValue(configContent, key, value)
    if (configContent !== old) {
      console.log(theme.success(`  ✓ ${key} = ${formatValue(value)}`))
    }
  }

  await writeFile(configPath, configContent, 'utf-8')
  console.log()
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
  }
  return raw.replace(/^['"]|['"]$/g, '')
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return `'${v}'`
  return String(v)
}

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
    let pathStack2: string[] = []
    let openIndents2: number[] = []

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

  console.log(theme.dim(`  ⚠ Could not set ${dotPath} — edit .palade/palade.config.ts manually`))
  return content
}
