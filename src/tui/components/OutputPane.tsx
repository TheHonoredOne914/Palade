import React from 'react'
import { Box, Text } from 'ink'

export interface OutputLine {
  type:
    | 'header'
    | 'config-error'
    | 'input'
    | 'output'
    | 'success'
    | 'error'
    | 'warn'
    | 'dim'
    | 'divider'
    | 'finding'
    | 'raw'
  text: string
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info'
  /** Stable identifier assigned when the line is appended. Used as the React
   * key so rolling-window re-renders don't reuse DOM nodes for wrong lines. */
  id?: number
}

export function OutputLineItem({ line }: { line: OutputLine }): React.JSX.Element {
  switch (line.type) {
    case 'input':
      return (
        <Box>
          <Text color="#FF3366" bold>
            {'❯ '}
          </Text>
          <Text color="#E5E7EB">{line.text}</Text>
        </Box>
      )

    case 'success':
      return (
        <Box>
          <Text color="#00E676">{'  ✓  '}</Text>
          <Text color="#D1FAE5">{line.text}</Text>
        </Box>
      )

    case 'error':
      return (
        <Box>
          <Text color="#FF3366">{'  ✗  '}</Text>
          <Text color="#FEE2E2">{line.text}</Text>
        </Box>
      )

    case 'warn':
      return (
        <Box>
          <Text color="#FFEA00">{'  ⚠  '}</Text>
          <Text color="#FEF3C7">{line.text}</Text>
        </Box>
      )

    case 'dim':
      return (
        <Box paddingLeft={2}>
          <Text color="#6B7280">{line.text}</Text>
        </Box>
      )

    case 'divider':
      return (
        <Box>
          <Text color="#374151">{'─'.repeat(60)}</Text>
        </Box>
      )

    case 'finding':
      return <FindingLine text={line.text} severity={line.severity} />

    default:
      return (
        <Box paddingLeft={2}>
          <Text color="#C9D1D9">{line.text}</Text>
        </Box>
      )
  }
}

function FindingLine({ text, severity }: { text: string; severity?: string }): React.JSX.Element {
  const chipColors: Record<string, { bg: string; label: string }> = {
    critical: { bg: '#FF3366', label: 'CRIT' },
    high: { bg: '#FF9933', label: 'HIGH' },
    medium: { bg: '#FFEA00', label: 'MED ' },
    low: { bg: '#6B7280', label: 'LOW ' },
    info: { bg: '#00D0FF', label: 'INFO' },
  }
  const chip = chipColors[severity ?? 'info'] ?? chipColors.info

  return (
    <Box paddingLeft={2} gap={1}>
      <Text backgroundColor={chip.bg} color="#000000" bold>
        {' '}
        {chip.label}{' '}
      </Text>
      <Text color="#E5E7EB">{text}</Text>
    </Box>
  )
}
