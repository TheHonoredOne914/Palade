import { describe, it, expect } from 'vitest'
import { sanitizeForLog, maskKey } from './sanitize.js'

describe('utils/sanitize', () => {
  describe('sanitizeForLog', () => {
    it('redacts secret-like keys', () => {
      const out = sanitizeForLog({ apiKey: 'abc', token: 'xyz', name: 'ok' })
      expect(out).toEqual({ apiKey: '[REDACTED]', token: '[REDACTED]', name: 'ok' })
    })

    it('recurses into nested plain objects', () => {
      const out = sanitizeForLog({ nested: { password: 'p', keep: 1 } })
      expect(out).toEqual({ nested: { password: '[REDACTED]', keep: 1 } })
    })

    it('passes arrays through unchanged', () => {
      const out = sanitizeForLog({ items: [1, 2, 3] })
      expect(out).toEqual({ items: [1, 2, 3] })
    })

    it('does not mangle Buffers into index-keyed objects', () => {
      const buf = Buffer.from('hello')
      const out = sanitizeForLog({ payload: buf })
      expect(out.payload).toBe(buf)
      expect(Buffer.isBuffer(out.payload)).toBe(true)
    })

    it('does not mangle typed arrays', () => {
      const arr = new Uint8Array([1, 2, 3])
      const out = sanitizeForLog({ bytes: arr })
      expect(out.bytes).toBe(arr)
    })

    it('leaves null values untouched', () => {
      const out = sanitizeForLog({ value: null })
      expect(out).toEqual({ value: null })
    })
  })

  describe('maskKey', () => {
    it('fully redacts short keys', () => {
      expect(maskKey('short')).toBe('[REDACTED]')
    })

    it('masks the middle of long keys', () => {
      expect(maskKey('sk-1234567890abcd')).toBe('sk-1...abcd')
    })
  })
})
