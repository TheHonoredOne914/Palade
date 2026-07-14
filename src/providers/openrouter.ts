import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { DEFAULT_DEADLINE_MS } from './base.js'
import { OpenAICompatibleProvider, type OpenAICompatibleConfig } from './openaiCompatible.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The canonical project repo, used as a last-resort fallback if package.json
// can't be read/parsed (e.g. an unusual install layout). Kept as a plain
// string constant — NOT the source of truth — because that role now belongs
// to package.json's own "repository" field (providers-002): a
// separately-hand-maintained literal here previously drifted to point at a
// personal fork instead of the project's actual repo.
const FALLBACK_REFERER = 'https://github.com/TheHonoredOne914/Palade'

function resolveDefaultReferer(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
      repository?: { url?: string } | string
    }
    const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
    if (!raw) return FALLBACK_REFERER
    // package.json convention wraps git URLs as "git+https://...git" —
    // OpenRouter's HTTP-Referer header wants a plain browsable URL.
    return raw.replace(/^git\+/, '').replace(/\.git$/, '')
  } catch {
    return FALLBACK_REFERER
  }
}

const DEFAULT_REFERER = resolveDefaultReferer()
const DEFAULT_TITLE = 'Palade'

// Thin subclass of the shared OpenAI-compatible adapter (providers-003) —
// OpenRouter's only quirk beyond the shared defaults is the extra
// HTTP-Referer/X-Title attribution headers it recommends sending.
export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(
    apiKey: string,
    model?: string,
    maxConcurrency?: number,
    baseUrl?: string,
    deadlineMs: number = DEFAULT_DEADLINE_MS,
    referer: string = DEFAULT_REFERER,
    title: string = DEFAULT_TITLE
  ) {
    const config: OpenAICompatibleConfig = {
      name: 'openrouter',
      label: 'OpenRouter',
      defaultModel: 'openrouter/free',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      defaultMaxConcurrency: 8,
      defaultMaxTokens: 4096,
      extraHeaders: () => ({ 'HTTP-Referer': referer, 'X-Title': title }),
    }
    super(config, apiKey, model, maxConcurrency, baseUrl, deadlineMs)
  }
}
