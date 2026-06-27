import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as dotenvConfig } from 'dotenv'
import { pathToFileURL } from 'node:url'
import { PaladeConfigSchema, type PaladeConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { PaladeConfigError } from '../errors/types.js'

dotenvConfig()

export function readPackageJson(projectRoot: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(join(projectRoot, 'package.json'), 'utf-8')
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

function collectKeys(prefix: string): string[] {
  const keys: string[] = []
  const single = process.env[`${prefix}_API_KEY`]
  if (single) keys.push(single)
  for (let i = 1; i <= 20; i++) {
    const val = process.env[`${prefix}_API_KEY_${i}`]
    if (val) keys.push(val)
  }
  return keys
}

function buildEnvConfig(): Partial<PaladeConfig> {
  const providers: Record<
    string,
    { apiKey: string; apiKeys?: string[]; model?: string; baseUrl?: string }
  > = {}

  const groqKeys = collectKeys('GROQ')
  if (groqKeys.length > 0) {
    providers.groq = { apiKey: groqKeys[0], apiKeys: groqKeys.length > 1 ? groqKeys : undefined }
  }

  const cerebrasKeys = collectKeys('CEREBRAS')
  if (cerebrasKeys.length > 0) {
    providers.cerebras = {
      apiKey: cerebrasKeys[0],
      apiKeys: cerebrasKeys.length > 1 ? cerebrasKeys : undefined,
    }
  }

  const nvidiaKeys = collectKeys('NVIDIA')
  if (nvidiaKeys.length > 0) {
    providers.nvidia = {
      apiKey: nvidiaKeys[0],
      apiKeys: nvidiaKeys.length > 1 ? nvidiaKeys : undefined,
      model: 'minimaxai/minimax-m3',
    }
  }

  const openrouterKeys = collectKeys('OPENROUTER')
  if (openrouterKeys.length > 0) {
    providers.openrouter = {
      apiKey: openrouterKeys[0],
      apiKeys: openrouterKeys.length > 1 ? openrouterKeys : undefined,
    }
  }

  const opencodeZenKeys = collectKeys('OPENCODE_ZEN')
  if (opencodeZenKeys.length > 0) {
    providers['opencode-zen'] = {
      apiKey: opencodeZenKeys[0],
      apiKeys: opencodeZenKeys.length > 1 ? opencodeZenKeys : undefined,
      model: 'deepseek-v4-flash-free',
    }
  }

  const ollamaModel = process.env.OLLAMA_MODEL
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL
  if (ollamaModel || ollamaBaseUrl) {
    providers['ollama'] = {
      apiKey: 'local', // fake key to pass validations if needed
      model: ollamaModel,
      baseUrl: ollamaBaseUrl,
    }
  }

  return {
    providers: providers as PaladeConfig['providers'],
  }
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.')
    return `Config error at ${path}: ${issue.message}`
  })
  return issues.join('\n')
}

export async function loadConfig(): Promise<PaladeConfig> {
  let raw: Record<string, unknown> | undefined

  try {
    let configPath = join(process.cwd(), 'palade.config.ts')

    const configArgIdx = process.argv.indexOf('--config')
    if (configArgIdx !== -1 && process.argv.length > configArgIdx + 1) {
      const rawPath = process.argv[configArgIdx + 1]
      if (!rawPath.endsWith('.ts')) {
        throw new PaladeConfigError('Config file must be a .ts file', '--config')
      }

      const absolutePath = join(process.cwd(), rawPath)
      if (!absolutePath.startsWith(process.cwd())) {
        throw new PaladeConfigError('Config file must be within the working directory', '--config')
      }
      configPath = absolutePath
    }

    const fileUrl = pathToFileURL(configPath).href
    // Dynamic import with invalidation via import specifier — Node's ESM
    // loader ignores query strings for file:// URLs on most platforms, so we
    // do not append cache-busting params that break tsx/jiti.
    const mod = await import(fileUrl)
    const defaulted = mod.default ?? mod
    if (defaulted !== null && typeof defaulted === 'object' && !Array.isArray(defaulted)) {
      raw = defaulted as Record<string, unknown>
    }
    // Non-object exports (functions, primitives) are silently ignored.
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code && code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_LOAD_ESM') {
      console.error(`Warning: Failed to load palade.config.ts: ${(e as Error).message}`)
    }
  }

  const envConfig = buildEnvConfig()
  const rawObj = (raw as Record<string, unknown>) ?? {}
  const rawProviders = (rawObj.providers as Record<string, unknown>) ?? {}
  const envProviders = (envConfig as Record<string, unknown>).providers as Record<string, unknown>

  const mergedProviders: Record<string, unknown> = { ...envProviders }
  for (const [key, val] of Object.entries(rawProviders)) {
    if (typeof val === 'object' && val !== null) {
      mergedProviders[key] = {
        ...((mergedProviders[key] as Record<string, unknown>) ?? {}),
        ...val,
      }
    } else {
      mergedProviders[key] = val
    }
  }

  const availableProviders = [
    'opencode-zen',
    'groq',
    'nvidia',
    'cerebras',
    'openrouter',
    'ollama',
  ].filter((p) => !!(mergedProviders[p] as any)?.apiKey)
  const defaultPrimary = availableProviders[0] ?? 'opencode-zen'
  const defaultSynthesis = availableProviders.length > 1 ? availableProviders[1] : defaultPrimary

  const rawSwarm = (rawObj.swarm as Record<string, unknown>) ?? {}

  const merged = {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...rawObj,
    swarm: {
      ...(DEFAULT_CONFIG.swarm as Record<string, unknown>),
      ...(((envConfig as Record<string, unknown>).swarm as Record<string, unknown>) ?? {}),
      ...rawSwarm,
      primary: rawSwarm.primary ?? defaultPrimary,
      synthesis: rawSwarm.synthesis ?? defaultSynthesis,
    },
    providers: mergedProviders,
  } as Record<string, unknown>

  const result = PaladeConfigSchema.safeParse(merged)

  if (!result.success) {
    throw new PaladeConfigError(
      formatZodError(result.error),
      'schema',
      'Check your palade.config.ts against the schema.'
    )
  }

  return result.data
}
