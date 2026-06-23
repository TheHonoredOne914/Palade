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
  const providers: Record<string, { apiKey: string; apiKeys?: string[]; model?: string }> = {}

  const groqKeys = collectKeys('GROQ')
  if (groqKeys.length > 0) {
    providers.groq = { apiKey: groqKeys[0], apiKeys: groqKeys.length > 1 ? groqKeys : undefined }
  }

  const cerebrasKeys = collectKeys('CEREBRAS')
  if (cerebrasKeys.length > 0) {
    providers.cerebras = { apiKey: cerebrasKeys[0], apiKeys: cerebrasKeys.length > 1 ? cerebrasKeys : undefined }
  }

  const nvidiaKeys = collectKeys('NVIDIA')
  if (nvidiaKeys.length > 0) {
    providers.nvidia = { apiKey: nvidiaKeys[0], apiKeys: nvidiaKeys.length > 1 ? nvidiaKeys : undefined, model: 'minimaxai/minimax-m3' }
  }

  const openrouterKeys = collectKeys('OPENROUTER')
  if (openrouterKeys.length > 0) {
    providers.openrouter = { apiKey: openrouterKeys[0], apiKeys: openrouterKeys.length > 1 ? openrouterKeys : undefined }
  }

  const opencodeZenKeys = collectKeys('OPENCODE_ZEN')
  if (opencodeZenKeys.length > 0) {
    providers['opencode-zen'] = {
      apiKey: opencodeZenKeys[0],
      apiKeys: opencodeZenKeys.length > 1 ? opencodeZenKeys : undefined,
      model: 'deepseek-v4-flash-free'
    }
  }

  return {
    providers: providers as PaladeConfig['providers']
  }
}

function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map(issue => {
    const path = issue.path.join('.')
    return `Config error at ${path}: ${issue.message}`
  })
  return issues.join('\n')
}

export async function loadConfig(): Promise<PaladeConfig> {
  let raw: Record<string, unknown> | undefined

  try {
    const configPath = join(process.cwd(), 'palade.config.ts')
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
    // No config file found — fall through to env vars
  }

  const envConfig = buildEnvConfig()
  const rawProviders = (raw as Record<string, unknown>)?.providers as Record<string, unknown> | undefined
  const envProviders = (envConfig as Record<string, unknown>).providers as Record<string, unknown> | undefined

  const merged = {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...(raw ?? {}),
    // For providers: env vars fill in missing keys, file config overrides
    providers: {
      ...envProviders,
      ...rawProviders,
    }
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
