import React from 'react'
import { Box, Text } from 'ink'

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

const GRADIENT = [
  '#FF3366', '#FF4E5B', '#FF6950', '#FF8446',
  '#FFA03B', '#FFBB30', '#FFD626', '#F9F871'
]

interface HeaderProps {
  providerStatus: Record<string, boolean>
  projectRoot: string
  version: string
}

export function Header({
  providerStatus,
  projectRoot,
  version,
}: HeaderProps): React.JSX.Element {
  const projectName = projectRoot.split(/[/\\]/).at(-1) ?? projectRoot

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1} borderStyle="round" borderColor="#374151" paddingX={2} paddingY={1}>
      {ASCII_ART.map((line, i) => (
        <Text key={i} color={GRADIENT[i] ?? '#FF3366'} bold>{line}</Text>
      ))}

      <Box justifyContent="space-between" marginTop={1}>
        <Box gap={1}>
          <Text color="#00D0FF" bold>v{version}</Text>
          <Text color="#6B7280">│</Text>
          <Text color="#E5E7EB">codebase intelligence</Text>
          <Text color="#6B7280">│</Text>
          <Text color="#FF9933" bold>{projectName}</Text>
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
          <ProviderDot
            name="openrouter"
            active={providerStatus['openrouter'] ?? false}
          />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="#6B7280" dimColor>{projectRoot}</Text>
      </Box>
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
    <Box gap={1}>
      <Text color={active ? '#00E676' : '#374151'}>{active ? '●' : '○'}</Text>
      <Text color={active ? '#E5E7EB' : '#6B7280'}>
        {name}
      </Text>
    </Box>
  )
}
