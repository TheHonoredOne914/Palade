import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Box, useApp, useInput, Text, Static } from 'ink'
import { Header } from './components/Header.js'
import { OutputLineItem } from './components/OutputPane.js'
import { CommandInput } from './components/CommandInput.js'
import { Autocomplete } from './components/Autocomplete.js'
import { SettingsPanel, PROVIDERS, readCurrentKeys } from './components/SettingsPanel.js'
import { useOutputStream } from './hooks/useOutputStream.js'
import { useCommandRunner } from './hooks/useCommandRunner.js'
import { useCommandHistory } from './hooks/useCommandHistory.js'
import { mountOutputAdapter, unmountOutputAdapter } from './outputAdapter.js'
import type { PaladeConfig } from '../config/schema.js'

const RAW_MODE_SUPPORTED =
  !!process.stdin.isTTY &&
  typeof (process.stdin as NodeJS.ReadStream & { setRawMode?: unknown }).setRawMode === 'function'

interface SafeInputHandlerProps {
  status: 'idle' | 'running'
  showSettings: boolean
  showAutocomplete: boolean
  onCtrlC: () => void
  onAbort: () => void
  onUp: () => void
  onDown: () => void
  onCloseSettings: () => void
  onNextProvider: () => void
  onPrevProvider: () => void
}

function SafeInputHandler({
  status,
  showSettings,
  showAutocomplete,
  onCtrlC,
  onAbort,
  onUp,
  onDown,
  onCloseSettings,
  onNextProvider,
  onPrevProvider,
}: SafeInputHandlerProps): null {
  useInput((input, key) => {
    if (key.escape) {
      if (showSettings) {
        onCloseSettings()
        return
      }
    }
    if (key.ctrl && input === 'c') {
      if (status === 'running') {
        onAbort()
        return
      }
      if (showSettings) {
        onCloseSettings()
        return
      }
      onCtrlC()
      return
    }
    // Tab cycles providers in settings — TextInput does NOT capture Tab
    if (showSettings && key.tab) {
      if (key.shift) {
        onPrevProvider()
      } else {
        onNextProvider()
      }
      return
    }
    if (!showSettings && !showAutocomplete) {
      if (key.upArrow) onUp()
      if (key.downArrow) onDown()
    }
  })
  return null
}

interface AppProps {
  config?: PaladeConfig
  providerStatus: Record<string, boolean>
  projectRoot: string
  version: string
  configError?: string
}

export function App({
  config,
  providerStatus,
  projectRoot,
  version,
  configError,
}: AppProps): React.JSX.Element {
  const { exit } = useApp()
  const [inputValue, setInputValue] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running'>('idle')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsProviderIdx, setSettingsProviderIdx] = useState(0)
  const [settingsKeys, setSettingsKeys] = useState<Record<string, string>>({})

  const { lines, appendLine, appendLines, clearOutput, clearNonce } = useOutputStream()
  const { pushToHistory, navigateHistory } = useCommandHistory()
  const abortRef = useRef<AbortController | null>(null)

  const openSettings = useCallback(() => {
    // Load existing keys when opening
    readCurrentKeys(projectRoot)
      .then((keys) => {
        setSettingsKeys(keys)
        setShowSettings(true)
      })
      .catch(() => setShowSettings(true))
  }, [projectRoot])

  const { dispatch } = useCommandRunner({
    config,
    projectRoot,
    appendLine,
    appendLines,
    clearOutput,
    setStatus,
    onExit: exit,
    onSettingsOpen: openSettings,
    getAbortSignal: () => abortRef.current?.signal,
  })

  useEffect(() => {
    mountOutputAdapter(appendLine)
    return () => {
      unmountOutputAdapter()
    }
  }, [appendLine])

  useEffect(() => {
    const handler = () => {
      if (showSettings) {
        setShowSettings(false)
        return
      }
      if (status === 'running') {
        abortRef.current?.abort()
        abortRef.current = null
        appendLine({ type: 'warn', text: '  Interrupted.' })
        setStatus('idle')
      } else {
        exit()
      }
    }
    process.on('SIGINT', handler)
    return () => {
      process.off('SIGINT', handler)
    }
  }, [status, showSettings, exit, appendLine])

  const handleSubmit = useCallback(
    (value: string) => {
      if (showAutocomplete) return // Let Autocomplete handle Enter key
      const trimmed = value.trim()
      if (!trimmed) return
      // Accept with or without leading slash
      const cmd = trimmed.startsWith('/') ? trimmed : '/' + trimmed
      if (cmd === '/settings') {
        openSettings()
        setInputValue('')
        setShowAutocomplete(false)
        return
      }
      pushToHistory(cmd)
      appendLine({ type: 'input', text: cmd })
      setInputValue('')
      setShowAutocomplete(false)
      abortRef.current = new AbortController()
      dispatch(cmd)
    },
    [dispatch, pushToHistory, appendLine, openSettings, showAutocomplete]
  )

  const handleChange = useCallback((value: string) => {
    setInputValue(value)
    setShowAutocomplete(value.startsWith('/') && value.length > 1)
  }, [])

  const handleHistoryNav = useCallback(
    (dir: 'up' | 'down') => {
      const prev = navigateHistory(dir)
      if (prev !== null) setInputValue(prev)
    },
    [navigateHistory]
  )

  const handleSettingsClose = useCallback(
    (message?: string) => {
      setShowSettings(false)
      if (message) appendLine({ type: 'output', text: '  ' + message })
    },
    [appendLine]
  )

  const handleNextProvider = useCallback(() => {
    setSettingsProviderIdx((i) => (i + 1) % PROVIDERS.length)
  }, [])

  const handlePrevProvider = useCallback(() => {
    setSettingsProviderIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length)
  }, [])

  const handleKeySaved = useCallback((providerId: string, key: string) => {
    setSettingsKeys((prev) => ({ ...prev, [providerId]: key }))
  }, [])

  return (
    <>
      {RAW_MODE_SUPPORTED && (
        <SafeInputHandler
          status={status}
          showSettings={showSettings}
          showAutocomplete={showAutocomplete}
          onCtrlC={exit}
          onAbort={() => {
            abortRef.current?.abort()
            abortRef.current = null
            appendLine({ type: 'warn', text: '  Interrupted.' })
            setStatus('idle')
          }}
          onUp={() => handleHistoryNav('up')}
          onDown={() => handleHistoryNav('down')}
          onCloseSettings={() => setShowSettings(false)}
          onNextProvider={handleNextProvider}
          onPrevProvider={handlePrevProvider}
        />
      )}

      {showSettings ? (
        <Box flexDirection="column" marginY={1}>
          <SettingsPanel
            projectRoot={projectRoot}
            selectedProviderIdx={settingsProviderIdx}
            existingKeys={settingsKeys}
            onKeySaved={handleKeySaved}
            onClose={handleSettingsClose}
          />
        </Box>
      ) : (
        <Static key={clearNonce} items={lines}>
          {(line, i) => {
            if (line.type === 'header') {
              return (
                <Box key={line.id ?? i} flexDirection="column">
                  <Header
                    providerStatus={providerStatus}
                    projectRoot={projectRoot}
                    version={version}
                  />
                  {configError && (
                    <Box
                      borderStyle="single"
                      borderColor="#F59E0B"
                      paddingX={1}
                      marginX={1}
                      marginBottom={1}
                    >
                      <Text color="#F59E0B" bold>
                        ⚠ Config:{' '}
                      </Text>
                      <Text color="#D1D5DB">{configError}</Text>
                    </Box>
                  )}
                </Box>
              )
            }
            return <OutputLineItem key={line.id ?? i} line={line} />
          }}
        </Static>
      )}

      {!showSettings && showAutocomplete && (
        <Autocomplete
          input={inputValue}
          projectRoot={projectRoot}
          onSelect={(val) => {
            if (val === '/settings') {
              openSettings()
              setInputValue('')
              setShowAutocomplete(false)
              return
            }
            if (val) {
              setInputValue(val)
              if (val.endsWith(' ')) {
                setShowAutocomplete(true)
                return
              }
            }
            setShowAutocomplete(false)
          }}
        />
      )}

      {!showSettings && (
        <CommandInput
          value={inputValue}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onHistoryNav={handleHistoryNav}
          isRunning={status === 'running'}
        />
      )}
    </>
  )
}
