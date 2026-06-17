import React from 'react'
import { Box, Text } from 'ink'
import { getStandardOwlLines } from '../../ui/owl.js'

const ASCII_ART = [
  '██████╗  █████╗ ██╗      █████╗ ██████╗ ███████╗',
  '██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██╔════╝',
  '██████╔╝███████║██║     ███████║██║  ██║█████╗  ',
  '██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██╔══╝  ',
  '██║     ██║  ██║██║     ██║  ██║██║  ██║██║     ',
  '██║     ██║  ██║██║     ██║  ██║██║  ██║██║     ',
  '██║     ██║  ██║███████╗██║  ██║██████╔╝███████╗',
  '╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝',
]

const PALADE_ROWS = ASCII_ART.length  // 6

interface HeaderProps {
  providerStatus: Record<string, boolean>
  projectRoot: string
}

export function Header({
  providerStatus,
  projectRoot,
}: HeaderProps): React.JSX.Element {
  const projectName = projectRoot.split(/[/\\]/).at(-1) ?? projectRoot
  const termWidth = process.stdout.columns ?? 80
  const showOwl = termWidth >= 100
  const owlLines = getStandardOwlLines()

  const owlRows = owlLines.length
  const padTop = Math.max(0, Math.floor((owlRows - PALADE_ROWS) / 2))
  const padBottom = Math.max(0, owlRows - PALADE_ROWS - padTop)

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1}>
      {showOwl ? (
        <Box flexDirection="row" alignItems="center" gap={2}>
          <Box flexDirection="column">
            {Array.from({ length: padTop }).map((_, i) => (
              <Text key={`pt${i}`}>{' '.repeat(42)}</Text>
            ))}
            {ASCII_ART.map((line, i) => (
              <Text key={i} color="#EF4444">{line}</Text>
            ))}
            {Array.from({ length: padBottom }).map((_, i) => (
              <Text key={`pb${i}`}>{' '.repeat(42)}</Text>
            ))}
          </Box>
          <Box flexDirection="column">
            {owlLines.map((line, i) => (
              <Text key={i}>{line}</Text>
            ))}
          </Box>
        </Box>
      ) : (
        ASCII_ART.map((line, i) => (
          <Text key={i} color="#EF4444">{line}</Text>
        ))
      )}

      <Box justifyContent="space-between" marginTop={0}>
        <Box>
          <Text color="#6B7280">  v0.1.0</Text>
          <Text color="#6B7280">  ·  </Text>
          <Text color="#6B7280">codebase intelligence</Text>
          <Text color="#6B7280">  ·  </Text>
          <Text color="#6B7280">{projectName}</Text>
        </Box>

        <Box gap={2}>
          <ProviderDot name="groq" active={providerStatus['groq'] ?? false} />
          <ProviderDot
            name="cerebras"
            active={providerStatus['cerebras'] ?? false}
          />
          <ProviderDot
            name="nvidia"
            active={providerStatus['nvidia'] ?? false}
          />
        </Box>
      </Box>

      <Text color="#374151">  {projectRoot}</Text>
      <Text color="#374151">{'─'.repeat(60)}</Text>
    </Box>
  )
}

function ProviderDot({
  name,
  active,
}: {
  name: string
  active: boolean
}): React.JSX.Element {
  return (
    <Box>
      <Text color={active ? '#10B981' : '#374151'}>{active ? '●' : '○'}</Text>
      <Text color="#6B7280">
        {' '}
        {name}
      </Text>
    </Box>
  )
}
