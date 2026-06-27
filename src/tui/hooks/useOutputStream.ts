import { useState, useCallback, useRef } from 'react'
import type { OutputLine } from '../components/OutputPane.js'

export function useOutputStream() {
  const idRef = useRef(0)
  const assignId = useCallback((line: OutputLine): OutputLine => {
    if (line.id === undefined) {
      line.id = ++idRef.current
    }
    return line
  }, [])

  const [lines, setLines] = useState<OutputLine[]>(
    (
      [
        { type: 'header', text: '' },
        { type: 'output', text: '' },
        {
          type: 'output',
          text: '  Welcome to PALADE.  Type /help to see available commands.',
        },
        {
          type: 'dim',
          text: '  Type / to start a command with autocomplete.',
        },
        { type: 'output', text: '' },
      ] as OutputLine[]
    ).map((l) => assignId(l))
  )

  const appendLine = useCallback(
    (line: OutputLine) => {
      setLines((prev) => [...prev, assignId(line)].slice(-500))
    },
    [assignId]
  )

  const appendLines = useCallback(
    (newLines: OutputLine[]) => {
      const withIds = newLines.map((l) => assignId(l))
      setLines((prev) => [...prev, ...withIds].slice(-500))
    },
    [assignId]
  )

  const clearOutput = useCallback(() => {
    const cleared: OutputLine = { type: 'dim', text: '  Output cleared.' }
    setLines([assignId(cleared)])
  }, [assignId])

  return { lines, appendLine, appendLines, clearOutput }
}
