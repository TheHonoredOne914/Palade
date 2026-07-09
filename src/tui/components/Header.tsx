import React from 'react'
import { Box, Text } from 'ink'
import { ASCII_ART, GRADIENT } from '../../ui/asciiArt.js'



interface HeaderProps {
  providerStatus: Record<string, boolean>
  projectRoot: string
  version: string
}

export function Header({ providerStatus, projectRoot, version }: HeaderProps): React.JSX.Element {
  const projectName = projectRoot.split(/[/\\]/).at(-1) ?? projectRoot

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      marginBottom={1}
      borderStyle="round"
      borderColor="#374151"
      paddingX={2}
      paddingY={1}
    >
      <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
        <Box flexDirection="column">
          {ASCII_ART.map((line, i) => (
            <Text key={i} color={GRADIENT[i] ?? '#FF3366'} bold>
              {line}
            </Text>
          ))}
        </Box>
        <Box paddingBottom={1} paddingRight={2}>
          <Text color="#6B7280" italic>
            By Carren Mathew
          </Text>
        </Box>
      </Box>

      <Box justifyContent="space-between" marginTop={1}>
        <Box gap={1}>
          <Text color="#00D0FF" bold>
            v{version}
          </Text>
          <Text color="#6B7280">│</Text>
          <Text color="#E5E7EB">codebase intelligence</Text>
          <Text color="#6B7280">│</Text>
          <Text color="#FF9933" bold>
            {projectName}
          </Text>
        </Box>

        <Box gap={2}>
          <ProviderDot name="groq" active={providerStatus['groq'] ?? false} />
          <ProviderDot name="cerebras" active={providerStatus['cerebras'] ?? false} />
          <ProviderDot name="nvidia" active={providerStatus['nvidia'] ?? false} />
          <ProviderDot name="openrouter" active={providerStatus['openrouter'] ?? false} />
          <ProviderDot name="opencode-zen" active={providerStatus['opencode-zen'] ?? false} />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="#6B7280" dimColor>
          {projectRoot}
        </Text>
      </Box>
    </Box>
  )
}

function ProviderDot({ name, active }: { name: string; active: boolean }): React.JSX.Element {
  return (
    <Box gap={1}>
      <Text color={active ? '#00E676' : '#374151'}>{active ? '●' : '○'}</Text>
      <Text color={active ? '#E5E7EB' : '#6B7280'}>{name}</Text>
    </Box>
  )
}
