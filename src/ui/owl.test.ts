import { describe, it, expect } from 'vitest'
import { getGhostOwlLines, getStandardOwlLines } from './owl.js'

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

describe('owl', () => {
  it('standard owl renders as an 8x16 sprite', () => {
    const lines = getStandardOwlLines()

    expect(lines.length).toBe(8)
    expect(lines.map((line) => stripAnsi(line).length)).toEqual(Array(8).fill(16))
    expect(stripAnsi(lines[0]).trim()).not.toBe('')
    expect(stripAnsi(lines[4]).trim()).not.toBe('')
  })

  it('ghost owl renders as an 8x14 sprite', () => {
    const lines = getGhostOwlLines()

    expect(lines.length).toBe(8)
    expect(lines.map((line) => stripAnsi(line).length)).toEqual(Array(8).fill(14))
  })
})
