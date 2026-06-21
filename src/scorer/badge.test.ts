import { describe, it, expect } from 'vitest'
import { getScoreColor, getBadgeData, renderBadge } from './badge.js'

describe('scorer/badge', () => {
  describe('getScoreColor', () => {
    it('maps score bands to badge colors', () => {
      expect(getScoreColor(95)).toBe('brightgreen')
      expect(getScoreColor(80)).toBe('green')
      expect(getScoreColor(65)).toBe('yellow')
      expect(getScoreColor(50)).toBe('orange')
      expect(getScoreColor(20)).toBe('red')
    })

    it('respects band boundaries', () => {
      expect(getScoreColor(90)).toBe('brightgreen')
      expect(getScoreColor(89)).toBe('green')
      expect(getScoreColor(75)).toBe('green')
      expect(getScoreColor(60)).toBe('yellow')
      expect(getScoreColor(40)).toBe('orange')
      expect(getScoreColor(39)).toBe('red')
    })
  })

  describe('getBadgeData', () => {
    it('formats the score as score/100', () => {
      const data = getBadgeData(68)
      expect(data.score).toBe('68/100')
      expect(data.color).toBe('yellow')
      expect(data.label).toBe('palade')
    })

    it('formats a perfect score', () => {
      expect(getBadgeData(100).score).toBe('100/100')
    })

    it('formats zero', () => {
      expect(getBadgeData(0).score).toBe('0/100')
    })
  })

  describe('renderBadge', () => {
    it('produces a well-formed SVG with the score text', () => {
      const svg = renderBadge(getBadgeData(72))
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg.includes('</svg>')).toBe(true)
      expect(svg.includes('72/100')).toBe(true)
      expect(svg.includes('palade')).toBe(true)
    })

    it('escapes special XML characters in the label', () => {
      const svg = renderBadge({ score: '50/100', color: 'orange', label: 'a&b<c>' })
      expect(svg.includes('a&amp;b&lt;c&gt;')).toBe(true)
      // raw unescaped ampersand/angle brackets must not appear in text content
      expect(svg.match(/aria-label="[^"]*a&b/)).toBeNull()
    })
  })
})
