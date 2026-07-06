import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { OutputLine } from './components/OutputPane.js'
import { mountOutputAdapter, unmountOutputAdapter } from './outputAdapter.js'

const collectAppend = () => {
  const lines: OutputLine[] = []
  const append = (line: OutputLine) => { lines.push(line) }
  return { lines, append }
}

beforeEach(() => {
  unmountOutputAdapter()
})

describe('mountOutputAdapter', () => {
  it('intercepts console.log and routes to append', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.log('hello', 'world')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({ type: 'output', text: 'hello world' })
  })

  it('intercepts console.warn', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.warn('warning')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({ type: 'warn', text: 'warning' })
  })

  it('intercepts console.error', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.error('error')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({ type: 'error', text: 'error' })
  })

  it('intercepts console.clear', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.clear()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({ type: 'divider', text: '' })
  })

  it('formats Error arguments as message', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.log(new Error('boom'))
    expect(lines[0].text).toBe('boom')
  })

  it('formats object arguments as JSON', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    console.log({ key: 'val' })
    expect(lines[0].text).toBe('{"key":"val"}')
  })

  it('ignores second mount (double-mount guard)', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)

    const lines2: OutputLine[] = []
    mountOutputAdapter((line) => { lines2.push(line) })

    console.log('test')
    expect(lines).toHaveLength(1)
    expect(lines2).toHaveLength(0)
  })
})

describe('unmountOutputAdapter', () => {
  it('restores original console methods', () => {
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error
    const origClear = console.clear

    const { append } = collectAppend()
    mountOutputAdapter(append)
    expect(console.log).not.toBe(origLog)

    unmountOutputAdapter()
    expect(console.log).toBe(origLog)
    expect(console.warn).toBe(origWarn)
    expect(console.error).toBe(origError)
    expect(console.clear).toBe(origClear)
  })

  it('does not forward after unmount', () => {
    const { lines, append } = collectAppend()
    mountOutputAdapter(append)
    unmountOutputAdapter()

    console.log('after unmount')
    expect(lines).toHaveLength(0)
  })
})
