import React from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'

interface CommandInputProps {
  value: string
  onChange: (val: string) => void
  onSubmit: (val: string) => void
  onHistoryNav: (dir: 'up' | 'down') => void
  isRunning: boolean
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  onHistoryNav,
  isRunning,
}: CommandInputProps): React.JSX.Element {
  useInput((_, key) => {
    if (key.upArrow) onHistoryNav('up')
    if (key.downArrow) onHistoryNav('down')
  })

  return (
    <Box
      borderStyle="single"
      borderColor={isRunning ? '#F59E0B' : '#EF4444'}
      paddingX={1}
      marginTop={1}
    >
      <Text color={isRunning ? '#F59E0B' : '#EF4444'} bold>
        {isRunning ? '⟳ ' : '❯ '}
      </Text>
      {isRunning ? (
        <Text color="#6B7280">Running... (Ctrl+C to interrupt)</Text>
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={'/review · /score · /settings · /help'}
        />
      )}
    </Box>
  )
}
