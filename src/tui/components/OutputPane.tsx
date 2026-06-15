import React from 'react'
import { Box, Text } from 'ink'

export interface OutputLine {
  type:
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
}

interface OutputPaneProps {
  lines: OutputLine[]
}

export function OutputPane({ lines }: OutputPaneProps): React.JSX.Element {
  const displayLines = lines.slice(-200)

  return (
    <Box flexDirection="column">
      {displayLines.map((line, i) => (
        <OutputLineItem key={i} line={line} />
      ))}
    </Box>
  )
}

function OutputLineItem({
  line,
}: {
  line: OutputLine
}): React.JSX.Element {
  switch (line.type) {
    case 'input':
      return (
        <Box>
          <Text color="#EF4444" bold>
            {'❯ '}
          </Text>
          <Text color="#E5E7EB">{line.text}</Text>
        </Box>
      )

    case 'success':
      return (
        <Box>
          <Text color="#10B981">
            {'  ✓  '}
          </Text>
          <Text color="#D1FAE5">{line.text}</Text>
        </Box>
      )

    case 'error':
      return (
        <Box>
          <Text color="#EF4444">
            {'  ✗  '}
          </Text>
          <Text color="#FEE2E2">{line.text}</Text>
        </Box>
      )

    case 'warn':
      return (
        <Box>
          <Text color="#F59E0B">
            {'  ⚠  '}
          </Text>
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

function FindingLine({
  text,
  severity,
}: {
  text: string
  severity?: string
}): React.JSX.Element {
  const chipColors: Record<string, { bg: string; label: string }> = {
    critical: { bg: '#EF4444', label: 'CRIT' },
    high: { bg: '#F97316', label: 'HIGH' },
    medium: { bg: '#F59E0B', label: 'MED ' },
    low: { bg: '#6B7280', label: 'LOW ' },
    info: { bg: '#3B82F6', label: 'INFO' },
  }
  const chip = chipColors[severity ?? 'info'] ?? chipColors.info

  return (
    <Box paddingLeft={2} gap={1}>
      <Text backgroundColor={chip.bg} color="white" bold>
        {' '}
        {chip.label}{' '}
      </Text>
      <Text color="#E5E7EB">{text}</Text>
    </Box>
  )
}
