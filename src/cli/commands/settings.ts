import chalk from 'chalk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { theme } from '../../ui/theme.js'
import { loadConfig } from '../../config/loader.js'
import { CliExitError } from '../../errors/types.js'

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

  await showCurrentConfig(projectRoot)
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
    console.log(`    Primary:    ${chalk.cyan(config.swarm?.primary ?? 'groq')}`)
    console.log(`    Synthesis:  ${chalk.cyan(config.swarm?.synthesis ?? 'cerebras')}`)
    console.log(`    Agents:     ${chalk.cyan(String(config.swarm?.agentCount ?? 6))}`)
    console.log(`    Timeout:    ${chalk.cyan(String(config.swarm?.timeoutMs ?? 120000))}ms`)

    if (config.output) {
      console.log()
      console.log(theme.bold('  Output:'))
      console.log(`    Formats:    ${chalk.cyan(config.output.formats?.join(', ') ?? 'html, json')}`)
      console.log(`    Directory:  ${chalk.cyan(config.output.dir ?? '.palade/reports')}`)
      console.log(`    Browser:    ${chalk.cyan(config.output.openBrowser !== false ? 'auto-open' : 'disabled')}`)
    }

    if (config.score) {
      console.log()
      console.log(theme.bold('  Score:'))
      console.log(`    History:    ${chalk.cyan(config.score.historyFile ?? '.palade/history.json')}`)
      console.log(`    Badge:      ${chalk.cyan(config.score.badge !== false ? 'enabled' : 'disabled')}`)
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
  console.log(chalk.cyan('    palade settings --set groq.apiKey=YOUR_KEY'))
  console.log(chalk.cyan('    palade settings --set swarm.primary=groq'))
  console.log(chalk.cyan('    palade settings --set swarm.agentCount=8'))
  console.log(chalk.cyan('    palade settings --set output.openBrowser=false'))
  console.log(chalk.cyan('    palade settings --init'))
  console.log()
}

async function initConfig(projectRoot: string): Promise<void> {
  const configPath = join(projectRoot, 'palade.config.ts')
  const ignorePath = join(projectRoot, '.paladeignore')

  if (!existsSync(join(projectRoot, '.palade'))) {
    await mkdir(join(projectRoot, '.palade'), { recursive: true })
  }

  if (!existsSync(configPath)) {
    const configContent = `// palade.config.ts — managed by 'palade settings'
// Edit manually or run 'palade settings' to update

export default {
  providers: {
    groq: {
      apiKey: process.env.GROQ_API_KEY ?? '',
      model: 'llama-3.3-70b-versatile',
      maxConcurrency: 8
    }
  },
  swarm: {
    primary: 'groq',
    synthesis: 'cerebras',
    agentCount: 6,
    timeoutMs: 120000
  },
  output: {
    dir: '.palade/reports',
    formats: ['html', 'json'],
    openBrowser: true,
    port: 4242
  },
  score: {
    historyFile: '.palade/history.json',
    badge: true,
    badgePath: 'palade-badge.svg'
  }
}
`
    await writeFile(configPath, configContent, 'utf-8')
    console.log(theme.success('  ✓ palade.config.ts created'))
  } else {
    console.log(theme.dim('  palade.config.ts already exists, skipping'))
  }

  if (!existsSync(ignorePath)) {
    const ignoreContent = `node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
`
    await writeFile(ignorePath, ignoreContent, 'utf-8')
    console.log(theme.success('  ✓ .paladeignore created'))
  } else {
    console.log(theme.dim('  .paladeignore already exists, skipping'))
  }

  console.log()
  console.log(theme.success('  ✓ Config initialized. Set your API key:'))
  console.log()
  console.log(chalk.cyan('    palade settings --set groq.apiKey=YOUR_KEY'))
  console.log()
}

async function applySets(projectRoot: string, sets: string[]): Promise<void> {
  const configPath = join(projectRoot, 'palade.config.ts')
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

    configContent = setNestedValue(configContent, key, value)
    console.log(theme.success(`  ✓ ${key} = ${formatValue(value)}`))
  }

  await writeFile(configPath, configContent, 'utf-8')
  console.log()
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''))
  }
  return raw.replace(/^['"]|['"]$/g, '')
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return `'${v}'`
  return String(v)
}

function setNestedValue(content: string, dotPath: string, value: unknown): string {
  const parts = dotPath.split('.')
  const valueStr = typeof value === 'string' ? `'${value}'` : String(value)
  const lines = content.split('\n')

  // Build regex to find a line like "  key:" at any nesting depth,
  // scoped to a section matching the first N-1 parts.
  // e.g. "swarm.primary" → find "primary:" inside the "swarm" section.
  // e.g. "providers.groq.model" → find "model:" inside "providers" > "groq" section.

  const keyName = parts[parts.length - 1]
  // Escape regex special chars in key
  const escapedKey = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Track nesting sections we've entered
  let matched = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const indent = line.length - trimmed.length

    // Track which section(s) we're inside via brace counting per section
    // Simple approach: match the key at any depth, but only if the
    // surrounding section context matches.

    // Direct pattern: "  key: value" or "  key: value," etc.
    const keyPattern = new RegExp(`^\\s*${escapedKey}\\s*:\\s*`)
    if (keyPattern.test(line) && !trimmed.startsWith('//')) {
      lines[i] = `${line.replace(/:\s*.*$/, '')}: ${valueStr}`
      matched = true
      break
    }
  }

  if (matched) {
    return lines.join('\n')
  }

  // Key not found — insert it inside the parent section.
  // For "swarm.primary", find "swarm: {" section and insert "primary: value" inside it.
  if (parts.length >= 2) {
    const sectionName = parts[0]
    const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sectionPattern = new RegExp(`^\\s*${escapedSection}\\s*:`)

    let inSection = false
    let sectionEnd = -1

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart()
      const lineIndent = lines[i].length - trimmed.length

      if (sectionPattern.test(trimmed) && !trimmed.startsWith('//')) {
        inSection = true
        continue
      }

      if (inSection) {
        // Find the closing brace of this section (matching indent or less)
        if (trimmed.startsWith('}') && lineIndent <= 2) {
          sectionEnd = i
          break
        }
      }
    }

    if (sectionEnd !== -1) {
      // Insert before the closing brace, with proper indentation
      const innerIndent = parts.length >= 3 ? '    '.repeat(parts.length - 1) : '  '
      const insertLine = `${innerIndent}${keyName}: ${valueStr}`

      // Ensure the line before the closing brace has a trailing comma
      for (let j = sectionEnd - 1; j >= 0; j--) {
        const prev = lines[j].trimEnd()
        if (prev && !prev.startsWith('//')) {
          if (!prev.endsWith(',') && !prev.endsWith('{') && !prev.endsWith('}')) {
            lines[j] = lines[j].trimEnd() + ','
          }
          break
        }
      }

      lines.splice(sectionEnd, 0, insertLine)
      return lines.join('\n')
    }
  }

  console.log(theme.dim(`  ⚠ Could not set ${dotPath} — edit palade.config.ts manually`))
  return content
}
