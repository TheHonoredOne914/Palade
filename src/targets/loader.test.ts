import { describe, it, expect } from 'vitest'
import { resolveTargetPaths } from './loader.js'

describe('resolveTargetPaths', () => {
  const projectRoot = process.platform === 'win32'
    ? 'C:\\Users\\dev\\myproject'
    : '/home/dev/myproject'

  it('returns forward-slash relative paths (never absolute)', () => {
    const target = { name: 'auth', entry: 'src/auth/', description: '' }
    const result = resolveTargetPaths(target, projectRoot)
    expect(result).toEqual(['src/auth'])
    for (const p of result) {
      expect(p).not.toContain('\\')
      expect(p).not.toMatch(/^[A-Z]:/i)  // not a Windows absolute path
      expect(p).not.toMatch(/^\//)       // not a Unix absolute path
    }
  })

  it('handles array entries', () => {
    const target = {
      name: 'api',
      entry: ['src/api/', 'lib/shared.ts'],
      description: '',
    }
    const result = resolveTargetPaths(target, projectRoot)
    expect(result).toEqual(['src/api', 'lib/shared.ts'])
    for (const p of result) {
      expect(p).not.toContain('\\')
    }
  })

  it('normalizes Windows backslashes to forward slashes', () => {
    const target = { name: 'deep', entry: 'src\\deep\\module', description: '' }
    const result = resolveTargetPaths(target, projectRoot)
    for (const p of result) {
      expect(p).not.toContain('\\')
    }
  })

  it('resolves dot entries to project-relative root', () => {
    const target = { name: 'root', entry: '.', description: '' }
    const result = resolveTargetPaths(target, projectRoot)
    // relative(root, root) returns '' on Windows, '.' on POSIX
    expect(result).toHaveLength(1)
    expect(result[0]).toMatch(/^\.?$/)
    for (const p of result) {
      expect(p).not.toContain('\\')
      expect(p).not.toMatch(/^[A-Z]:/i)
      expect(p).not.toMatch(/^\//)
    }
  })
})
