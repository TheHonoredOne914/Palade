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
  let config
  const providerStatus: Record<string, boolean> = {}
  let configError: string | undefined

  try {
    config = await loadConfig()
  } catch (err: unknown) {
    configError = err instanceof Error ? err.message : String(err)
  }

  // Router init is separate from config loading: a config can be valid while
  // provider initialization fails. If it does, surface the error and null out
  // config so the TUI commands (which depend on a working router) don't run
  // against half-initialized providers.
  if (config) {
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
    />,
    {
      exitOnCtrlC: false,
      patchConsole: false,
    }
  )

  try {
    await waitUntilExit()
  } catch (err: unknown) {
    // Ink rejects waitUntilExit() if rendering throws. Surface a readable
    // message instead of crashing with an unhandled rejection.
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`\nPalade TUI exited unexpectedly: ${message}\n`)
    process.exitCode = 1
  }
}
