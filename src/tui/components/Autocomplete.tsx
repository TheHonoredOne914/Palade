import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { COMMAND_REGISTRY } from '../commands/registry.js'

interface AutocompleteProps {
  input: string
  onSelect: (cmd: string) => void
}

export function Autocomplete({
  input,
  onSelect,
}: AutocompleteProps): React.JSX.Element {
  const [selectedIdx, setSelectedIdx] = useState(0)

  const matches = useMemo(() => {
    const query = input.slice(1).toLowerCase()
    return COMMAND_REGISTRY.filter(
      (cmd) =>
        cmd.name.includes(query) ||
        cmd.description.toLowerCase().includes(query)
    ).slice(0, 6)
  }, [input])

  useEffect(() => {
    setSelectedIdx(0)
  }, [matches])

  useInput((_, key) => {
    if (key.tab || key.downArrow) {
      setSelectedIdx((i) => Math.min(i + 1, matches.length - 1))
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (key.return && matches[selectedIdx]) {
      onSelect(
        '/' + matches[selectedIdx].name + (matches[selectedIdx].args ? ' ' : '')
      )
    }
  })

  if (matches.length === 0) return <Box />

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#00D0FF"
      paddingX={1}
      marginX={1}
    >
      {matches.map((cmd, i) => (
        <Box key={cmd.name} gap={2}>
          <Text
            color={i === selectedIdx ? '#000000' : '#E5E7EB'}
            backgroundColor={i === selectedIdx ? '#00D0FF' : undefined}
            bold={i === selectedIdx}
          >
            {' /' + cmd.name}
            {cmd.args ? ' ' + cmd.args : ''}
          </Text>
          <Text color={i === selectedIdx ? '#E5E7EB' : '#6B7280'}>{cmd.description}</Text>
          {i === selectedIdx && <Text color="#FF9933">  ↵ to fill</Text>}
        </Box>
      ))}
      <Box marginTop={0}>
        <Text color="#374151">  ↑↓ navigate  ↵ select  Tab cycle</Text>
      </Box>
    </Box>
  )
}
