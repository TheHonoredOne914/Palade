import { useState, useCallback } from 'react'
import type { OutputLine } from '../components/OutputPane.js'

export function useOutputStream() {
  const [lines, setLines] = useState<OutputLine[]>([
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
  ])

  const appendLine = useCallback((line: OutputLine) => {
    setLines((prev) => [...prev, line].slice(-500))
  }, [])

  const appendLines = useCallback((newLines: OutputLine[]) => {
    setLines((prev) => [...prev, ...newLines].slice(-500))
  }, [])

  const clearOutput = useCallback(() => {
    setLines([{ type: 'dim', text: '  Output cleared.' }])
  }, [])

  return { lines, appendLine, appendLines, clearOutput }
}
