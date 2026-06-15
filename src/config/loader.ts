import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config as dotenvConfig } from 'dotenv'
import { pathToFileURL } from 'node:url'
import { PaladeConfigSchema, type PaladeConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

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
    const cacheBust = `?t=${Date.now()}`
    const mod = await import(`${fileUrl}${cacheBust}`)
    raw = mod.default ?? mod
  } catch (e) {
    // No config file found — fall through to env vars
  }

  const envConfig = buildEnvConfig()
  const merged = {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...(raw ?? {}),
    providers: {
      ...((envConfig as Record<string, unknown>).providers as Record<string, unknown> ?? {}),
      ...((raw as Record<string, unknown>)?.providers as Record<string, unknown> ?? {})
    }
  } as Record<string, unknown>

  if (raw && typeof raw === 'object' && 'providers' in raw) {
    merged.providers = {
      ...(envConfig as Record<string, unknown>).providers as Record<string, unknown>,
      ...((raw as Record<string, unknown>).providers as Record<string, unknown>)
    }
  } else {
    merged.providers = (envConfig as Record<string, unknown>).providers as Record<string, unknown>
  }

  const result = PaladeConfigSchema.safeParse(merged)

  if (!result.success) {
    console.error(formatZodError(result.error))
    process.exit(1)
  }

  return result.data
}
