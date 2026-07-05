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

/**
 * Same precedence as config/loader.ts loadConfig(): `.palade/palade.config.ts`
 * first, then the root-level file. Writing to a different file than the one
 * loadConfig reads would save keys that are never picked up.
 */
function resolveConfigPath(projectRoot: string): string {
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

async function saveApiKey(
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
