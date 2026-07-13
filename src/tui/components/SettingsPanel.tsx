import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { saveApiKey, saveConfigValue, PROVIDERS } from '../../config/apiKey.js'
import type { ProviderId } from '../../config/apiKey.js'
import { fetchModels } from '../../config/models.js'
import { BUILTIN_NAMES } from '../../agents/registry.js'

// (uicli-008) Both this panel and cli/commands/settings.ts's interactive
// flow already share the single PROVIDERS source (config/apiKey.ts) for the
// provider list/labels/env-var names — that used to be the two flows'
// biggest divergence risk. One residual, INTENTIONAL divergence remains:
// "is this provider configured" is checked differently in each. This panel
// uses `existingKeys` (readCurrentKeys(): env vars, then .env, then the
// config file, in that precedence) so it can prefill/mask an already-set key
// for editing. settings.ts's `showCurrentConfig` instead reads only
// `config.providers[id].apiKey` directly, since it's reporting the
// PERSISTED config file's state, not "is a key active this session from any
// source". Unifying those would change one flow's semantics to match the
// other's, which is out of scope for this fix round — documented here
// instead of forcing a bigger behavioral merge.

interface SettingsPanelProps {
  projectRoot: string
  /** Controlled: parent drives provider selection via Tab */
  selectedProviderIdx: number
  existingKeys: Record<string, string>
  swarmPrimary: string
  swarmSynthesis: string
  swarmAgentCount: number
  providerShares: Record<string, number>
  currentModels: Record<string, string>
  onKeySaved: (providerId: string, key: string) => void
  onClose: (message?: string) => void
}

type FocusField = 'key' | 'model' | 'share' | 'agents' | 'swarm' | 'synthesis'
const FOCUS_ORDER: FocusField[] = ['key', 'model', 'share', 'agents', 'swarm', 'synthesis']

const MAX_AGENTS = BUILTIN_NAMES.length

interface ModelFetchState {
  status: 'loading' | 'loaded'
  models: string[]
}

export function SettingsPanel({
  projectRoot,
  selectedProviderIdx,
  existingKeys,
  swarmPrimary,
  swarmSynthesis,
  swarmAgentCount,
  providerShares,
  currentModels,
  onKeySaved,
  onClose,
}: SettingsPanelProps): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const [manualModelInput, setManualModelInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [focusField, setFocusField] = useState<FocusField>('key')
  const [modelState, setModelState] = useState<Record<string, ModelFetchState>>({})
  const [modelIdx, setModelIdx] = useState(0)
  const [localModels, setLocalModels] = useState<Record<string, string>>(currentModels)

  const [swarmIdx, setSwarmIdx] = useState(() =>
    Math.max(
      0,
      PROVIDERS.findIndex((p) => p.id === swarmPrimary)
    )
  )
  const [synthesisIdx, setSynthesisIdx] = useState(() =>
    Math.max(
      0,
      PROVIDERS.findIndex((p) => p.id === swarmSynthesis)
    )
  )
  const [localSwarmPrimary, setLocalSwarmPrimary] = useState(swarmPrimary)
  const [localSwarmSynthesis, setLocalSwarmSynthesis] = useState(swarmSynthesis)
  const [agentCount, setAgentCount] = useState(Math.min(swarmAgentCount, MAX_AGENTS))
  const [savedAgentCount, setSavedAgentCount] = useState(swarmAgentCount)
  const [shares, setShares] = useState<Record<string, number>>(providerShares)
  const [savedShares, setSavedShares] = useState<Record<string, number>>(providerShares)

  const selectedProvider = PROVIDERS[selectedProviderIdx]
  const modelEntry = modelState[selectedProvider.id]
  const hasFetchedModels = modelEntry?.status === 'loaded' && modelEntry.models.length > 0

  // Fetch the live model list the first time the model field is focused for a
  // given provider tab. Skipped when there is no key yet — an unauthenticated
  // call would just fail, so go straight to the manual-entry fallback.
  useEffect(() => {
    if (focusField !== 'model') return
    const id = selectedProvider.id
    const cached = modelState[id]
    if (cached) {
      // Already fetched for this provider (maybe on an earlier tab visit) —
      // resync the selected index to its current model instead of carrying
      // over whatever index was selected for the previously focused tab.
      if (cached.status === 'loaded' && cached.models.length > 0) {
        const current = localModels[id]
        const idx = current ? cached.models.indexOf(current) : -1
        setModelIdx(idx >= 0 ? idx : 0)
      }
      return
    }
    const key = existingKeys[id]
    if (!key) return
    setModelState((prev) => ({ ...prev, [id]: { status: 'loading', models: [] } }))
    fetchModels(id as ProviderId, key).then((models) => {
      setModelState((prev) => ({ ...prev, [id]: { status: 'loaded', models } }))
      if (models.length > 0) {
        const current = localModels[id]
        const idx = current ? models.indexOf(current) : -1
        setModelIdx(idx >= 0 ? idx : 0)
      }
    })
  }, [focusField, selectedProviderIdx, existingKeys, modelState, localModels])

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
        setMessage(`✓ ${selectedProvider.label} API key saved to .env`)
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setSaving(false)
      }
    },
    [projectRoot, selectedProvider, onClose, onKeySaved]
  )

  const saveModel = useCallback(
    async (model: string) => {
      if (!model.trim()) return
      try {
        await saveConfigValue(projectRoot, `providers.${selectedProvider.id}.model`, model.trim())
        setLocalModels((prev) => ({ ...prev, [selectedProvider.id]: model.trim() }))
        setManualModelInput('')
        setMessage(`✓ ${selectedProvider.label} model set to ${model.trim()}`)
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [projectRoot, selectedProvider]
  )

  const saveSwarmRole = useCallback(
    async (role: 'primary' | 'synthesis', providerId: string) => {
      try {
        await saveConfigValue(projectRoot, `swarm.${role}`, providerId)
        if (role === 'primary') setLocalSwarmPrimary(providerId)
        else setLocalSwarmSynthesis(providerId)
        setMessage(`✓ swarm.${role} set to ${providerId}`)
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [projectRoot]
  )

  const saveAgentCount = useCallback(
    async (count: number) => {
      try {
        // Trim already-saved provider shares whose sum now exceeds the new
        // agentCount — mirrors the share field's own clamp (tui-001) just
        // above. Without this, shrinking agentCount below the saved shares'
        // total silently reproduces the over-allocation bug that clamp was
        // written to prevent: expandProviderShares would then truncate the
        // excess based on object key order with no warning shown.
        const total = Object.values(shares).reduce((sum, v) => sum + (v ?? 0), 0)
        let trimmed = false
        if (total > count) {
          trimmed = true
          let excess = total - count
          const next: Record<string, number> = { ...shares }
          for (const id of Object.keys(next)) {
            if (excess <= 0) break
            const val = next[id] ?? 0
            const reduceBy = Math.min(val, excess)
            next[id] = val - reduceBy
            excess -= reduceBy
          }
          for (const [id, val] of Object.entries(next)) {
            if (val !== shares[id]) {
              await saveConfigValue(projectRoot, `swarm.providerShares.${id}`, val)
            }
          }
          setShares(next)
          setSavedShares(next)
        }
        await saveConfigValue(projectRoot, 'swarm.agentCount', count)
        setSavedAgentCount(count)
        setMessage(
          trimmed
            ? `✓ swarm.agentCount set to ${count} (provider shares trimmed to fit)`
            : `✓ swarm.agentCount set to ${count}`
        )
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [projectRoot, shares]
  )

  const saveShare = useCallback(
    async (providerId: string, count: number) => {
      try {
        await saveConfigValue(projectRoot, `swarm.providerShares.${providerId}`, count)
        setSavedShares((prev) => ({ ...prev, [providerId]: count }))
        setMessage(`✓ ${providerId} agent share set to ${count}`)
      } catch (err) {
        setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [projectRoot]
  )

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusField(
        (f) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(f) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length]
      )
      return
    }
    if (key.downArrow) {
      setFocusField((f) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(f) + 1) % FOCUS_ORDER.length])
      return
    }
    if (focusField === 'model' && hasFetchedModels) {
      const models = modelEntry!.models
      if (key.leftArrow) {
        setModelIdx((i) => Math.max(0, i - 1))
        return
      }
      if (key.rightArrow) {
        setModelIdx((i) => Math.min(models.length - 1, i + 1))
        return
      }
      if (key.return) {
        saveModel(models[modelIdx])
        return
      }
    }
    if (focusField === 'share') {
      const id = selectedProvider.id
      const current = shares[id] ?? 0
      if (key.leftArrow) {
        setShares((prev) => ({ ...prev, [id]: Math.max(0, current - 1) }))
        return
      }
      if (key.rightArrow) {
        // Clamp to the remaining unallocated capacity across ALL providers,
        // not just agentCount alone — otherwise several providers can each
        // be pushed up to agentCount, silently producing a total that
        // exceeds agentCount (expandProviderShares then truncates it based
        // on object key order with no warning shown) (tui-001).
        const othersTotal = Object.entries(shares).reduce(
          (sum, [pid, val]) => (pid === id ? sum : sum + (val ?? 0)),
          0
        )
        const maxForThis = Math.max(0, agentCount - othersTotal)
        setShares((prev) => ({ ...prev, [id]: Math.min(maxForThis, current + 1) }))
        return
      }
      if (key.return) {
        saveShare(id, current)
        return
      }
    }
    if (focusField === 'agents') {
      if (key.leftArrow) {
        setAgentCount((c) => Math.max(1, c - 1))
        return
      }
      if (key.rightArrow) {
        setAgentCount((c) => Math.min(MAX_AGENTS, c + 1))
        return
      }
      if (key.return) {
        saveAgentCount(agentCount)
        return
      }
    }
    if (focusField === 'swarm') {
      if (key.leftArrow) {
        setSwarmIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length)
        return
      }
      if (key.rightArrow) {
        setSwarmIdx((i) => (i + 1) % PROVIDERS.length)
        return
      }
      if (key.return) {
        saveSwarmRole('primary', PROVIDERS[swarmIdx].id)
        return
      }
    }
    if (focusField === 'synthesis') {
      if (key.leftArrow) {
        setSynthesisIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length)
        return
      }
      if (key.rightArrow) {
        setSynthesisIdx((i) => (i + 1) % PROVIDERS.length)
        return
      }
      if (key.return) {
        saveSwarmRole('synthesis', PROVIDERS[synthesisIdx].id)
        return
      }
    }
  })

  const modelDisplay = hasFetchedModels
    ? modelEntry!.models[modelIdx]
    : modelEntry?.status === 'loading'
      ? 'loading models…'
      : (localModels[selectedProvider.id] ?? '(type a model id below)')

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
        <Text color="#6B7280">
          — Tab: provider · ↑↓: field · ←→: value · Enter: save · empty Enter: close
        </Text>
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

      {/* API key field */}
      <Box marginBottom={1}>
        <Text color={focusField === 'key' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'key'}>
          {focusField === 'key' ? '▸ ' : '  '}
          {selectedProvider.label} key:{' '}
        </Text>
        {existingKeys[selectedProvider.id] ? (
          <Text color="#10B981">{'●●●●●● …' + existingKeys[selectedProvider.id].slice(-6)}</Text>
        ) : (
          <Text color="#6B7280" dimColor>
            not set
          </Text>
        )}
      </Box>
      {focusField === 'key' && (
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
                saving
                  ? 'Saving...'
                  : `Paste ${selectedProvider.label} API key, press Enter to save`
              }
              mask="*"
            />
          </Box>
        </Box>
      )}

      {/* Model field */}
      <Box marginBottom={1}>
        <Text color={focusField === 'model' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'model'}>
          {focusField === 'model' ? '▸ ' : '  '}
          Model: {'< '}
        </Text>
        <Text color={focusField === 'model' ? '#00D0FF' : '#D1D5DB'}>{modelDisplay}</Text>
        <Text color={focusField === 'model' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
      </Box>
      {focusField === 'model' && !hasFetchedModels && modelEntry?.status !== 'loading' && (
        <Box borderStyle="single" borderColor="#FF3366" paddingX={1} marginBottom={1}>
          <Text color="#FF3366" bold>
            model ›{' '}
          </Text>
          <Box flexGrow={1}>
            <TextInput
              value={manualModelInput}
              onChange={setManualModelInput}
              onSubmit={saveModel}
              placeholder="Type a model id, press Enter to save"
            />
          </Box>
        </Box>
      )}

      {/* Agent share field (per provider tab) */}
      <Box marginBottom={1}>
        <Text color={focusField === 'share' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'share'}>
          {focusField === 'share' ? '▸ ' : '  '}
          Agent share: {'< '}
        </Text>
        <Text color={focusField === 'share' ? '#00D0FF' : '#D1D5DB'}>
          {shares[selectedProvider.id] ?? 0}
        </Text>
        <Text color={focusField === 'share' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
        <Text color="#4B5563" dimColor>
          {'  ('}
          {Object.values(shares).reduce((a, b) => a + b, 0)}
          {'/'}
          {agentCount}
          {' allocated, saved: '}
          {savedShares[selectedProvider.id] ?? 0}
          {'; unallocated agents use the swarm provider)'}
        </Text>
      </Box>

      {/* Agent count field */}
      <Box marginBottom={1}>
        <Text
          color={focusField === 'agents' ? '#FF3366' : '#9CA3AF'}
          bold={focusField === 'agents'}
        >
          {focusField === 'agents' ? '▸ ' : '  '}
          Agent count: {'< '}
        </Text>
        <Text color={focusField === 'agents' ? '#00D0FF' : '#D1D5DB'}>{agentCount}</Text>
        <Text color={focusField === 'agents' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
        <Text color="#4B5563" dimColor>
          {'  (max '}
          {MAX_AGENTS}
          {', saved: '}
          {savedAgentCount}
          {')'}
        </Text>
      </Box>

      {/* Swarm provider field */}
      <Box marginBottom={1}>
        <Text color={focusField === 'swarm' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'swarm'}>
          {focusField === 'swarm' ? '▸ ' : '  '}
          Swarm provider: {'< '}
        </Text>
        <Text color={focusField === 'swarm' ? '#00D0FF' : '#D1D5DB'}>
          {PROVIDERS[swarmIdx].label}
        </Text>
        <Text color={focusField === 'swarm' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
        <Text color="#4B5563" dimColor>
          {'  (current: '}
          {localSwarmPrimary}
          {')'}
        </Text>
      </Box>

      {/* Synthesis provider field */}
      <Box marginBottom={1}>
        <Text
          color={focusField === 'synthesis' ? '#FF3366' : '#9CA3AF'}
          bold={focusField === 'synthesis'}
        >
          {focusField === 'synthesis' ? '▸ ' : '  '}
          Synthesis provider: {'< '}
        </Text>
        <Text color={focusField === 'synthesis' ? '#00D0FF' : '#D1D5DB'}>
          {PROVIDERS[synthesisIdx].label}
        </Text>
        <Text color={focusField === 'synthesis' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
        <Text color="#4B5563" dimColor>
          {'  (current: '}
          {localSwarmSynthesis}
          {')'}
        </Text>
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
