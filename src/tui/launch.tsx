import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { loadConfig } from '../config/loader.js'
import { initRouter } from '../providers/router.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
) as { version: string }

export async function launchTUI(): Promise<void> {
  let config
  const providerStatus: Record<string, boolean> = {}
  let configError: string | undefined

  try {
    config = await loadConfig()
    await initRouter(config)
    providerStatus.groq = !!config.providers?.groq?.apiKey
    providerStatus.cerebras = !!config.providers?.cerebras?.apiKey
    providerStatus.nvidia = !!config.providers?.nvidia?.apiKey
  } catch (err: unknown) {
    configError = err instanceof Error ? err.message : String(err)
  }

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
    }
  )

  await waitUntilExit()
}
