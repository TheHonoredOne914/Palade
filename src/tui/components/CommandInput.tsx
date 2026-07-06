import React from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'

interface CommandInputProps {
  value: string
  onChange: (val: string) => void
  onSubmit: (val: string) => void
  isRunning: boolean
}

export function CommandInput({
  value,
  onChange,
  onSubmit,
  isRunning,
}: CommandInputProps): React.JSX.Element {
  return (
    <Box
      borderStyle="round"
      borderColor={isRunning ? '#FF9933' : '#00D0FF'}
      paddingX={1}
      marginTop={0}
      gap={1}
    >
      <Text color={isRunning ? '#FF9933' : '#00D0FF'} bold>
        {isRunning ? <Spinner type="aesthetic" /> : '❯'}
      </Text>
      {isRunning ? (
        <Text color="#6B7280">Swarm executing... (Ctrl+C to interrupt)</Text>
      ) : (
        <Box flexGrow={1}>
          <TextInput
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            placeholder={'/review · /score · /settings · /help'}
          />
        </Box>
      )}
    </Box>
  )
}
