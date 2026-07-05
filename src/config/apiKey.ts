import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const PROVIDERS = [
  { id: 'groq', label: 'Groq', env: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  { id: 'cerebras', label: 'Cerebras', env: 'CEREBRAS_API_KEY', model: 'gpt-oss-120b' },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    env: 'OPENROUTER_API_KEY',
    model: 'deepseek/deepseek-chat-v3-0324:free',
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
    content = `// palade.config.ts — managed by Palade TUI settings\nexport default {\n  providers: {},\n  swarm: { primary: '${providerId}', synthesis: '${providerId}', agentCount: 6 },\n  output: { dir: '.palade/reports', formats: ['html', 'json'], openBrowser: true, port: 4242 },\n  score: { historyFile: '.palade/history.json', badge: true, badgePath: 'palade-badge.svg' }\n}\n`
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
