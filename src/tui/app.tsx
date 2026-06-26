import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Box, useApp, useInput } from 'ink'
import { Header } from './components/Header.js'
import { OutputPane } from './components/OutputPane.js'
import { CommandInput } from './components/CommandInput.js'
import { StatusBar } from './components/StatusBar.js'
import { Autocomplete } from './components/Autocomplete.js'
import { useOutputStream } from './hooks/useOutputStream.js'
import { useCommandRunner } from './hooks/useCommandRunner.js'
import { useCommandHistory } from './hooks/useCommandHistory.js'
import { mountOutputAdapter, unmountOutputAdapter } from './outputAdapter.js'
import type { PaladeConfig } from '../config/schema.js'
import { Text } from 'ink'

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

  const { lines, appendLine, appendLines, clearOutput } = useOutputStream()
  const { pushToHistory, navigateHistory } = useCommandHistory()
  const { dispatch } = useCommandRunner({
    config,
    projectRoot,
    appendLine,
    appendLines,
    clearOutput,
    setStatus,
    onExit: exit,
  })

  useEffect(() => {
    mountOutputAdapter(appendLine)
    return () => {
      unmountOutputAdapter()
    }
  }, [appendLine])

  const abortRef = useRef<AbortController | null>(null)

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (status === 'running') {
        abortRef.current?.abort()
        abortRef.current = null
        appendLine({ type: 'warn', text: '  Interrupted.' })
        setStatus('idle')
      } else {
        exit()
      }
    }
  })

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) return

      pushToHistory(trimmed)
      appendLine({ type: 'input', text: trimmed })
      setInputValue('')
      setShowAutocomplete(false)
      dispatch(trimmed)
    },
    [dispatch, pushToHistory, appendLine]
  )

  const handleChange = useCallback((value: string) => {
    setInputValue(value)
    setShowAutocomplete(value.startsWith('/') && value.length > 0)
  }, [])

  const handleHistoryNav = useCallback(
    (dir: 'up' | 'down') => {
      const prev = navigateHistory(dir)
      if (prev !== null) setInputValue(prev)
    },
    [navigateHistory]
  )

  return (
    <Box flexDirection="column" height="100%">
      <Header providerStatus={providerStatus} projectRoot={projectRoot} version={version} />

      {configError && (
        <Box borderStyle="single" borderColor="#F59E0B" paddingX={1} marginX={1}>
          <Text color="#F59E0B" bold>
            ⚠ Config:
          </Text>
          <Text color="#D1D5DB"> {configError}</Text>
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <OutputPane lines={lines} />
      </Box>

      {showAutocomplete && (
        <Autocomplete
          input={inputValue}
          onSelect={(cmd) => {
            setInputValue(cmd)
            setShowAutocomplete(false)
          }}
        />
      )}

      <CommandInput
        value={inputValue}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onHistoryNav={handleHistoryNav}
        isRunning={status === 'running'}
      />

      <StatusBar status={status} projectRoot={projectRoot} />
    </Box>
  )
}
