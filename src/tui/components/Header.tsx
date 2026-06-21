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
    <Box flexDirection="column" flexShrink={0} marginBottom={1}>
      {ASCII_ART.map((line, i) => (
        <Text key={i} color="#EF4444">{line}</Text>
      ))}

      <Box justifyContent="space-between" marginTop={0}>
        <Box>
          <Text color="#6B7280">  v{version}</Text>
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
