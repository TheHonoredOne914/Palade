import { useState, useRef, useCallback } from 'react'

export function useCommandHistory() {
  const [history, setHistory] = useState<string[]>([])
  const cursorRef = useRef<number>(-1)

  const pushToHistory = useCallback((cmd: string) => {
    setHistory((prev) => {
      if (prev.at(-1) === cmd) return prev
      return [...prev, cmd].slice(-100)
    })
    cursorRef.current = -1
  }, [])

  const navigateHistory = useCallback(
    (dir: 'up' | 'down'): string | null => {
      const len = history.length
      if (len === 0) return null

      if (dir === 'up') {
        cursorRef.current =
          cursorRef.current === -1
            ? len - 1
            : Math.max(0, cursorRef.current - 1)
      } else {
        if (cursorRef.current === -1) return null
        cursorRef.current = cursorRef.current + 1
        if (cursorRef.current >= len) {
          cursorRef.current = -1
          return ''
        }
      }

      return history[cursorRef.current] ?? null
    },
    [history]
  )

  return { history, pushToHistory, navigateHistory }
}
