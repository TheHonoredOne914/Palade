import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { COMMAND_REGISTRY } from '../commands/registry.js'
import { loadTargets } from '../../targets/loader.js'
import type { TargetDefinition } from '../../targets/schema.js'

interface AutocompleteProps {
  input: string
  projectRoot: string
  onSelect: (cmd: string) => void
}

type Suggestion = { text: string; display: string; desc: string }

export function Autocomplete({
  input,
  projectRoot,
  onSelect,
}: AutocompleteProps): React.JSX.Element {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [targets, setTargets] = useState<TargetDefinition[]>([])

  useEffect(() => {
    loadTargets(projectRoot)
      .then(setTargets)
      .catch(() => {})
  }, [projectRoot])

  const matches = useMemo<Suggestion[]>(() => {
    // Target autocomplete
    const cmdMatch = input.match(/^\/(review)(.*)$/)
    if (cmdMatch) {
      const [, cmd, rest] = cmdMatch
      const isTargetFlag = rest.includes('--target')

      let before = `/${cmd} `
      let query = rest.trim().toLowerCase()

      if (isTargetFlag) {
        const parts = rest.split('--target')
        before = parts[0] + '--target '
        query = (parts[1] ?? '').trim().toLowerCase()
      }

      // Hide target suggestions if the user is typing something else (like --format)
      if (
        !isTargetFlag &&
        rest.length > 0 &&
        !rest.trim().startsWith('--target') &&
        rest.trim() !== ''
      ) {
        // but if they are typing a target name directly after /review space?
        // The user specifically asked for targets to appear for auto completion.
      }

      const targetMatches = targets
        .filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            `--target ${t.name}`.toLowerCase().includes(query)
        )
        .map((t) => ({
          text: isTargetFlag ? before + t.name : `/${cmd} --target ${t.name}`,
          display: isTargetFlag ? t.name : `--target ${t.name}`,
          desc: `Target (${Array.isArray(t.entry) ? t.entry.length + ' files' : t.entry})`,
        }))
        .slice(0, 5)

      if (!isTargetFlag && cmd === 'review' && '.'.includes(query)) {
        return [
          { text: '/review .', display: '/review .', desc: 'Full codebase review' },
          ...targetMatches,
        ]
      }

      return targetMatches
    }

    // Command autocomplete
    const query = input.slice(1).toLowerCase().split(' ')[0] ?? ''
    return COMMAND_REGISTRY.filter(
      (cmd) => cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
    )
      .map((cmd) => ({
        text: '/' + cmd.name + (cmd.args ? ' ' : ''),
        display: '/' + cmd.name + (cmd.args ? ' ' + cmd.args : ''),
        desc: cmd.description,
      }))
      .slice(0, 6)
  }, [input, targets])

  useEffect(() => {
    setSelectedIdx(0)
  }, [matches])

  // When nothing matches, hide the (empty) autocomplete so the parent's Enter
  // handler can submit the raw input instead of both handlers swallowing it.
  useEffect(() => {
    if (matches.length === 0) onSelect('')
  }, [matches, onSelect])

  useInput((keyInput, key) => {
    if (key.tab || key.downArrow) {
      setSelectedIdx((i) => Math.min(i + 1, matches.length - 1))
    }
    if (key.upArrow) {
      setSelectedIdx((i) => Math.max(i - 1, 0))
    }
    if (key.escape) {
      onSelect('') // close autocomplete
    }
    if (key.return && matches[selectedIdx]) {
      onSelect(matches[selectedIdx].text)
    }
  })

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#00D0FF"
      paddingX={1}
      marginX={1}
      height={8} // 6 matches + 2 border lines
    >
      {matches.map((match, i) => (
        <Box key={match.display + i} gap={2}>
          <Text
            color={i === selectedIdx ? '#000000' : '#E5E7EB'}
            backgroundColor={i === selectedIdx ? '#00D0FF' : undefined}
            bold={i === selectedIdx}
          >
            {' ' + match.display}
          </Text>
          <Text color={i === selectedIdx ? '#E5E7EB' : '#6B7280'}>{match.desc}</Text>
          {i === selectedIdx && <Text color="#FF9933"> ↵ to fill</Text>}
        </Box>
      ))}
      <Box marginTop={0}>
        <Text color="#374151"> ↑↓ navigate ↵ select Tab cycle</Text>
      </Box>
    </Box>
  )
}
