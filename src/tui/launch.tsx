import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { loadConfig } from '../config/loader.js'
import { initRouter } from '../providers/router.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  version: string
}

export async function launchTUI(): Promise<void> {
  process.env.PALADE_TUI = '1'

  const { existsSync } = await import('node:fs')
  const hasAnyEnvKey = [
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
    'CEREBRAS_API_KEY',
    'NVIDIA_API_KEY',
    'OPENCODE_ZEN_API_KEY',
    'OLLAMA_MODEL',
    'OLLAMA_BASE_URL',
  ].some((k) => !!process.env[k])

  let config
  const providerStatus: Record<string, boolean> = {}
  let configError: string | undefined

  try {
    config = await loadConfig()
  } catch (err: unknown) {
    configError = err instanceof Error ? err.message : String(err)
  }

  const hasConfigProviderKey = config
    ? Object.values(config.providers ?? {}).some((p: any) => !!p?.apiKey)
    : false

  const noProvider = !hasAnyEnvKey && !hasConfigProviderKey

  // Hint when no config file exists but keys are present
  const hasConfigFile =
    existsSync(join(process.cwd(), 'palade.config.ts')) ||
    existsSync(join(process.cwd(), '.palade', 'palade.config.ts'))
  if (!noProvider && !hasConfigFile) {
    const { default: chalk } = await import('chalk')
    console.log(
      chalk.dim('Using auto-detected settings. Run `palade init` anytime to customize.\n')
    )
  }

  // Router init is separate from config loading: a config can be valid while
  // provider initialization fails. If it does, surface the error and null out
  // config so the TUI commands (which depend on a working router) don't run
  // against half-initialized providers.
  if (config && !noProvider) {
    try {
      await initRouter(config)
      providerStatus.groq = !!config.providers?.groq?.apiKey
      providerStatus.cerebras = !!config.providers?.cerebras?.apiKey
      providerStatus.nvidia = !!config.providers?.nvidia?.apiKey
      providerStatus.openrouter = !!config.providers?.openrouter?.apiKey
      providerStatus['opencode-zen'] = !!config.providers?.['opencode-zen']?.apiKey
    } catch (err: unknown) {
      configError = `Provider init failed: ${err instanceof Error ? err.message : String(err)}`
      config = undefined
    }
  }

  // Let Ink render natively in the terminal so standard scrolling works.

  const { waitUntilExit } = render(
    <App
      config={config}
      providerStatus={providerStatus}
      projectRoot={process.cwd()}
      version={pkg.version}
      configError={configError}
      noProvider={noProvider}
    />,
    {
      exitOnCtrlC: false,
      patchConsole: false,
    }
  )

  await waitUntilExit()
}
