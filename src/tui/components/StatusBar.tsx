import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

interface StatusBarProps {
  status: 'idle' | 'running'
  projectRoot: string
}

export function StatusBar({ status, projectRoot }: StatusBarProps): React.JSX.Element {
  const termWidth = process.stdout.columns || 80
  const isRunning = status === 'running'

  return (
    <Box
      borderStyle="round"
      borderColor={isRunning ? '#FF9933' : '#00E676'}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={1}>
        {isRunning ? (
          <Text color="#FF9933">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text color="#00E676">◆</Text>
        )}
        <Text color={isRunning ? '#FF9933' : '#00E676'} bold>
          {isRunning ? 'Processing...' : 'Ready'}
        </Text>
      </Box>

      <Text color="#FF3366" bold>
        Palade Engine
      </Text>
    </Box>
  )
}
