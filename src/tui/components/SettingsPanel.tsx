import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const PROVIDERS = [
  { id: 'groq', label: 'Groq', env: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  { id: 'cerebras', label: 'Cerebras', env: 'CEREBRAS_API_KEY', model: 'llama3.1-70b' },
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

/** Emit a value as a safe single-quoted TypeScript string literal, escaping
 * any character that could break out of the literal or corrupt the generated
 * source (quotes, backslashes, newlines). JSON.stringify handles escaping for
 * us; we then convert the double-quoted result to a single-quoted literal to
 * match the surrounding config style. */
export function toTsStringLiteral(value: string): string {
  const jsonEscaped = JSON.stringify(value)
  // Strip the surrounding double quotes, un-escape any JSON-escaped double
  // quote (which does not need escaping inside single quotes), then escape
  // single quotes, and wrap in single quotes.
  const inner = jsonEscaped
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/'/g, "\\'")
  return `'${inner}'`
}

/** Reverse the escaping applied by toTsStringLiteral for the common escapes
 * that appear in an extracted string body. */
function decodeTsStringBody(body: string): string {
  return body.replace(/\\(['"\\nrt])/g, (_m, ch) => {
    switch (ch) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      default:
        return ch
    }
  })
}

export async function readCurrentKeys(projectRoot: string): Promise<Record<string, string>> {
  const configPath = join(projectRoot, 'palade.config.ts')
  const result: Record<string, string> = {}
  if (!existsSync(configPath)) return result
  try {
    const content = await readFile(configPath, 'utf-8')
    for (const p of PROVIDERS) {
      // Match the string body allowing escaped quotes/backslashes inside, then
      // decode the escapes so the returned value matches what was written.
      const re = new RegExp(
        `${p.id}[\\s\\S]{0,200}?apiKey:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`
      )
      const m = content.match(re)
      if (m) result[p.id] = decodeTsStringBody(m[2])
    }
  } catch {
    /* ignore */
  }
  return result
}

async function saveApiKey(
  projectRoot: string,
  providerId: ProviderId,
  apiKey: string
): Promise<void> {
  const configPath = join(projectRoot, 'palade.config.ts')
  const paladeDir = join(projectRoot, '.palade')
  if (!existsSync(paladeDir)) await mkdir(paladeDir, { recursive: true })

  let content: string
  try {
    content = await readFile(configPath, 'utf-8')
  } catch {
    content = `// palade.config.ts — managed by Palade TUI settings\nexport default {\n  providers: {},\n  swarm: { primary: 'groq', synthesis: 'cerebras', agentCount: 6, timeoutMs: 120000 },\n  output: { dir: '.palade/reports', formats: ['html', 'json'], openBrowser: true, port: 4242 },\n  score: { historyFile: '.palade/history.json', badge: true, badgePath: 'palade-badge.svg' }\n}\n`
  }

  const prov = PROVIDERS.find((p) => p.id === providerId)!
  const keyLiteral = toTsStringLiteral(apiKey)
  // Replace the whole apiKey value (quotes included) with a freshly-escaped
  // literal. Use a replacer function so characters like `$` in the key are not
  // interpreted as replacement-pattern references.
  const updateRe = new RegExp(
    `(${providerId}[\\s\\S]{0,200}?apiKey:\\s*)(['"])(?:\\\\.|(?!\\2).)*\\2`
  )
  if (updateRe.test(content)) {
    content = content.replace(updateRe, (_full, prefix: string) => `${prefix}${keyLiteral}`)
  } else {
    const provBlock = `    '${providerId}': {\n      apiKey: ${keyLiteral},\n      model: ${toTsStringLiteral(prov.model)}\n    },\n`
    content = content.replace(/(providers\s*:\s*\{)/, (_full, prefix: string) => `${prefix}\n${provBlock}`)
  }

  await writeFile(configPath, content, 'utf-8')
}

interface SettingsPanelProps {
  projectRoot: string
  /** Controlled: parent drives provider selection via Tab */
  selectedProviderIdx: number
  existingKeys: Record<string, string>
  onKeySaved: (providerId: string, key: string) => void
  onClose: (message?: string) => void
}

export function SettingsPanel({
  projectRoot,
  selectedProviderIdx,
  existingKeys,
  onKeySaved,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const selectedProvider = PROVIDERS[selectedProviderIdx]

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        onClose()
        return
      }
      setSaving(true)
      setMessage(null)
      try {
        await saveApiKey(projectRoot, selectedProvider.id as ProviderId, trimmed)
        onKeySaved(selectedProvider.id, trimmed)
        setInputValue('')
        setMessage(`✓ ${selectedProvider.label} API key saved to palade.config.ts`)
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setSaving(false)
      }
    },
    [projectRoot, selectedProvider, onClose, onKeySaved]
  )

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#FF3366"
      paddingX={2}
      paddingY={1}
      marginX={1}
    >
      {/* Title */}
      <Box marginBottom={1} gap={2}>
        <Text color="#FF3366" bold>
          ⚙ PALADE SETTINGS
        </Text>
        <Text color="#6B7280">— Tab to switch provider · Enter to save · empty Enter to close</Text>
      </Box>

      {/* Provider tabs */}
      <Box gap={0} marginBottom={1}>
        {PROVIDERS.map((p, i) => {
          const hasKey = !!existingKeys[p.id]
          const isSelected = i === selectedProviderIdx
          return (
            <Box
              key={p.id}
              borderStyle={isSelected ? 'round' : undefined}
              borderColor={isSelected ? '#FF3366' : undefined}
              paddingX={1}
              marginRight={1}
            >
              <Text
                color={isSelected ? '#FF3366' : hasKey ? '#10B981' : '#6B7280'}
                bold={isSelected}
              >
                {hasKey ? '● ' : '○ '}
                {p.label}
              </Text>
            </Box>
          )
        })}
        <Text color="#4B5563" dimColor>
          {' '}
          [Tab] to switch
        </Text>
      </Box>

      {/* Current key status */}
      <Box marginBottom={1}>
        <Text color="#9CA3AF"> {selectedProvider.label} key: </Text>
        {existingKeys[selectedProvider.id] ? (
          <Text color="#10B981">{'●●●●●● …' + existingKeys[selectedProvider.id].slice(-6)}</Text>
        ) : (
          <Text color="#6B7280" dimColor>
            not set
          </Text>
        )}
      </Box>

      {/* Key input */}
      <Box borderStyle="single" borderColor="#FF3366" paddingX={1} marginBottom={1}>
        <Text color="#FF3366" bold>
          key ›{' '}
        </Text>
        <Box flexGrow={1}>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={
              saving ? 'Saving...' : `Paste ${selectedProvider.label} API key, press Enter to save`
            }
            mask="*"
          />
        </Box>
      </Box>

      {/* Env hint */}
      <Text color="#4B5563" dimColor>
        {' '}
        Env var: {selectedProvider.env}
      </Text>

      {/* Message */}
      {message && (
        <Box marginTop={1}>
          <Text color={message.startsWith('✓') ? '#10B981' : '#EF4444'} bold>
            {message}
          </Text>
        </Box>
      )}
    </Box>
  )
}
