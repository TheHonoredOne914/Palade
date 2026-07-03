import { useState, useCallback, useRef } from 'react'
import type { OutputLine } from '../components/OutputPane.js'

export function useOutputStream() {
  const idRef = useRef(0)
  // Bumped by clearOutput to force Ink's <Static> to remount. Static commits
  // output permanently and only advances its render cursor when items.length
  // grows, so a remount is the only way a clear can re-render from scratch.
  const [clearNonce, setClearNonce] = useState(0)
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

  // NOTE: lines must stay append-only (no front truncation). Ink's <Static>
  // only renders new items when items.length increases; capping the length
  // would freeze its render cursor and permanently stop new output.
  const appendLine = useCallback(
    (line: OutputLine) => {
      setLines((prev) => [...prev, assignId(line)])
    },
    [assignId]
  )

  const appendLines = useCallback(
    (newLines: OutputLine[]) => {
      const withIds = newLines.map((l) => assignId(l))
      setLines((prev) => [...prev, ...withIds])
    },
    [assignId]
  )

  const clearOutput = useCallback(() => {
    const cleared: OutputLine = { type: 'dim', text: '  Output cleared.' }
    setLines([assignId(cleared)])
    setClearNonce((n) => n + 1)
  }, [assignId])

  return { lines, appendLine, appendLines, clearOutput, clearNonce }
}
