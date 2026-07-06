import React, { useCallback, useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { saveApiKey, saveConfigValue, PROVIDERS } from '../../config/apiKey.js'
import type { ProviderId } from '../../config/apiKey.js'
import { fetchModels } from '../../config/models.js'

interface SettingsPanelProps {
  projectRoot: string
  /** Controlled: parent drives provider selection via Tab */
  selectedProviderIdx: number
  existingKeys: Record<string, string>
  swarmPrimary: string
  swarmSynthesis: string
  currentModels: Record<string, string>
  onKeySaved: (providerId: string, key: string) => void
  onClose: (message?: string) => void
}

type FocusField = 'key' | 'model' | 'swarm' | 'synthesis'
const FOCUS_ORDER: FocusField[] = ['key', 'model', 'swarm', 'synthesis']

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

  const [swarmIdx, setSwarmIdx] = useState(() => Math.max(0, PROVIDERS.findIndex((p) => p.id === swarmPrimary)))
  const [synthesisIdx, setSynthesisIdx] = useState(() =>
    Math.max(0, PROVIDERS.findIndex((p) => p.id === swarmSynthesis))
  )
  const [localSwarmPrimary, setLocalSwarmPrimary] = useState(swarmPrimary)
  const [localSwarmSynthesis, setLocalSwarmSynthesis] = useState(swarmSynthesis)

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
        setMessage(`✓ ${selectedProvider.label} API key saved to palade.config.ts`)
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

  useInput((_input, key) => {
    if (key.upArrow) {
      setFocusField((f) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(f) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length])
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
      : localModels[selectedProvider.id] ?? '(type a model id below)'

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
                saving ? 'Saving...' : `Paste ${selectedProvider.label} API key, press Enter to save`
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

      {/* Swarm provider field */}
      <Box marginBottom={1}>
        <Text color={focusField === 'swarm' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'swarm'}>
          {focusField === 'swarm' ? '▸ ' : '  '}
          Swarm provider: {'< '}
        </Text>
        <Text color={focusField === 'swarm' ? '#00D0FF' : '#D1D5DB'}>{PROVIDERS[swarmIdx].label}</Text>
        <Text color={focusField === 'swarm' ? '#FF3366' : '#9CA3AF'}>{' >'}</Text>
        <Text color="#4B5563" dimColor>
          {'  (current: '}
          {localSwarmPrimary}
          {')'}
        </Text>
      </Box>

      {/* Synthesis provider field */}
      <Box marginBottom={1}>
        <Text color={focusField === 'synthesis' ? '#FF3366' : '#9CA3AF'} bold={focusField === 'synthesis'}>
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
