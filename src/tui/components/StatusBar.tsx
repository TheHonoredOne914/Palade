import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  status: 'idle' | 'running'
  projectRoot: string
}

export function StatusBar({
  status,
  projectRoot,
}: StatusBarProps): React.JSX.Element {
  const termWidth = process.stdout.columns || 80

  const leftText = status === 'running' ? '  ⟳  running' : '  ◆  ready'
  const rightText = 'by Carren Mathew  '

  const pad = Math.max(0, termWidth - leftText.length - rightText.length)

  return (
    <Box>
      <Text
        color={status === 'running' ? '#F59E0B' : '#10B981'}
      >
        {leftText}
      </Text>
      <Text>
        {' '.repeat(pad)}
      </Text>
      <Text color="#EF4444" bold>
        {rightText}
      </Text>
    </Box>
  )
}
