import { useState, useCallback, useRef, useEffect } from 'react'
import type { OutputLine } from '../components/OutputPane.js'

// Ink's <Static> only ever renders items appended since the last render (it
// tracks progress purely via items.length), so the backing array must grow
// append-only during normal operation — see the note on appendLine below.
// To keep long-running TUI sessions from accumulating unbounded memory, once
// the buffer crosses MAX_LINES we trim it down to the last WINDOW_LINES and
// force <Static> to remount (via clearNonce) so its internal render cursor
// resets to the now-shorter array instead of freezing on the old length.
const MAX_LINES = 2000
const WINDOW_LINES = 500

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
    // Re-append a fresh header line (banner, provider status, project name,
    // etc. — see the initial `lines` state above) after clearing, so /clear
    // doesn't permanently remove it from the screen for the rest of the
    // session — the header is otherwise never re-appended anywhere.
    const header: OutputLine = { type: 'header', text: '' }
    const cleared: OutputLine = { type: 'dim', text: '  Output cleared.' }
    setLines([assignId(header), assignId(cleared)])
    setClearNonce((n) => n + 1)
  }, [assignId])

  // Bound memory growth: once the buffer gets too large, window it down and
  // force <Static> to remount so its render cursor doesn't freeze on a
  // length it will never see again.
  useEffect(() => {
    if (lines.length > MAX_LINES) {
      setLines((prev) => {
        const windowed = prev.slice(-WINDOW_LINES)
        // Preserve the header line across windowing — without this it
        // eventually scrolls out of the kept window like any other line and
        // never comes back.
        const header = prev.find((l) => l.type === 'header')
        if (header && !windowed.includes(header)) {
          return [header, ...windowed]
        }
        return windowed
      })
      setClearNonce((n) => n + 1)
    }
  }, [lines.length])

  return { lines, appendLine, appendLines, clearOutput, clearNonce }
}
