import type { OutputLine } from './components/OutputPane.js'

type AppendFn = (line: OutputLine) => void

let _append: AppendFn | null = null
let _originalLog: typeof console.log
let _originalWarn: typeof console.warn
let _originalError: typeof console.error
let _originalClear: typeof console.clear

export function mountOutputAdapter(append: AppendFn): void {
  _append = append
  _originalLog = console.log
  _originalWarn = console.warn
  _originalError = console.error
  _originalClear = console.clear

  console.log = (...args: unknown[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
    _append?.({ type: 'output', text })
  }

  console.warn = (...args: unknown[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
    _append?.({ type: 'warn', text })
  }

  console.error = (...args: unknown[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ')
    _append?.({ type: 'error', text })
  }

  console.clear = () => {
    _append?.({ type: 'divider', text: '' })
  }
}

export function unmountOutputAdapter(): void {
  if (_originalLog) console.log = _originalLog
  if (_originalWarn) console.warn = _originalWarn
  if (_originalError) console.error = _originalError
  if (_originalClear) console.clear = _originalClear
  _append = null
}
