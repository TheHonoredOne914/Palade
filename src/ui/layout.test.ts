import { describe, it, expect } from 'vitest'
import { visibleWidth } from './layout.js'

const ESC = String.fromCharCode(27)

describe('ui/layout', () => {
  describe('visibleWidth', () => {
    it('ignores basic ANSI color codes', () => {
      const wrapped = `${ESC}[31mhello${ESC}[39m`
      expect(visibleWidth(wrapped)).toBe('hello'.length)
    })

    it('ignores 256-color (38;5;n) sequences', () => {
      const wrapped = `${ESC}[38;5;208mwarn${ESC}[39m`
      expect(visibleWidth(wrapped)).toBe('warn'.length)
    })

    it('ignores truecolor (38;2;r;g;b) sequences', () => {
      // chalk.hex output when the terminal supports 24-bit color
      const wrapped = `${ESC}[38;2;255;51;102mcritical${ESC}[39m`
      expect(visibleWidth(wrapped)).toBe('critical'.length)
    })

    it('ignores combined style + truecolor sequences', () => {
      const wrapped = `${ESC}[1m${ESC}[38;2;16;185;129mA+${ESC}[39m${ESC}[22m`
      expect(visibleWidth(wrapped)).toBe('A+'.length)
    })

    it('returns plain length for strings with no ANSI codes', () => {
      expect(visibleWidth('plain text')).toBe('plain text'.length)
    })
  })
})
