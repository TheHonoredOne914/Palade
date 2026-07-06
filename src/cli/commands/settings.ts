import chalk from 'chalk'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { theme } from '../../ui/theme.js'
import { loadConfig } from '../../config/loader.js'
import { PaladeConfigSchema } from '../../config/schema.js'
import { PROVIDERS, saveApiKey, setNestedValue, type ProviderId } from '../../config/apiKey.js'
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
  // Mirrors picker.ts's guard: readline prompts below never resolve without a
  // real terminal, so a non-TTY invocation (CI, piped input, etc.) would hang
  // forever instead of failing fast.
  if (!process.stdin.isTTY) {
    console.error(
      chalk.red(
        '  Interactive settings require a terminal (no stdin TTY detected). ' +
          'Use `palade settings --set key=value` or `palade settings --list` instead.'
      )
    )
    throw new CliExitError(1)
  }

  await showCurrentConfig(projectRoot)

  console.log()
  const wantsApi = await askConfirm('Do you want to configure an API key for a provider?', true)
  if (!wantsApi) {
    return
  }

  const providerIds: string[] = PROVIDERS.map((p) => p.id)
  const provider = (await askList('Select a provider:', providerIds)) as ProviderId

  const key = await askQuestion(`Enter your API key for ${provider}: `)
  if (!key.trim()) {
    console.log(theme.dim('No key provided. Cancelled.'))
    return
  }

  await saveApiKey(projectRoot, provider as ProviderId, key.trim())
  const prov = PROVIDERS.find((p) => p.id === provider)
  const envVar = prov?.env ?? `${provider.toUpperCase().replace('-', '_')}_API_KEY`
  console.log(theme.success(`\n  ✓ Saved ${envVar}\n`))
}

async function showCurrentConfig(projectRoot: string): Promise<void> {
  console.log()
  console.log(theme.bold('  Palade Settings'))
  console.log(theme.dim('  ─────────────────────────────────'))

  try {
    const config = await loadConfig()

    console.log()
    console.log(theme.bold('  Providers:'))

    for (const prov of PROVIDERS) {
      const p = (config.providers as Record<string, { apiKey?: string; model?: string }>)[prov.id]
      if (p) {
        const keyStatus = p.apiKey ? chalk.green('● set') : chalk.red('○ not set')
        const model = p.model ? chalk.dim(` (${p.model})`) : ''
        console.log(`    ${theme.accent('◆')} ${prov.id.padEnd(14)} ${keyStatus}${model}`)
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

  let currentConfig: any
  try {
    currentConfig = await loadConfig()
  } catch {
    currentConfig = {}
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

    // Validate against schema first
    const testConfig = JSON.parse(JSON.stringify(currentConfig))
    const parts = key.split('.')
    let curr = testConfig
    for (let i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) curr[parts[i]] = {}
      curr = curr[parts[i]]
    }
    curr[parts[parts.length - 1]] = value

    try {
      PaladeConfigSchema.parse(testConfig)
    } catch (err: any) {
      const msg = err.errors?.[0]?.message || String(err)
      console.error(chalk.red(`  Invalid value for ${key}: ${msg}`))
      continue
    }

    currentConfig = testConfig

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
