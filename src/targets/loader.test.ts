import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadTargets, resolveTargetPaths } from './loader.js'

describe('loadTargets file resolution', () => {
  const tmpDirs: string[] = []
  const makeTmpDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'palade-targets-'))
    tmpDirs.push(dir)
    return dir
  }
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const targetsSource = (name: string): string =>
    `export default [{ name: '${name}', description: 'd', entry: ['src/'] }]\n`

  it('returns [] when neither targets file exists', async () => {
    expect(await loadTargets(makeTmpDir())).toEqual([])
  })

  it('falls back to legacy root palade.targets.ts when .palade/ file is absent', async () => {
    const root = makeTmpDir()
    writeFileSync(join(root, 'palade.targets.ts'), targetsSource('legacy'), 'utf-8')
    const targets = await loadTargets(root)
    expect(targets.map((t) => t.name)).toEqual(['legacy'])
  })

  it('prefers .palade/palade.targets.ts over the legacy root file', async () => {
    const root = makeTmpDir()
    mkdirSync(join(root, '.palade'))
    writeFileSync(join(root, '.palade', 'palade.targets.ts'), targetsSource('canonical'), 'utf-8')
    writeFileSync(join(root, 'palade.targets.ts'), targetsSource('legacy'), 'utf-8')
    const targets = await loadTargets(root)
    expect(targets.map((t) => t.name)).toEqual(['canonical'])
  })
})

describe('resolveTargetPaths', () => {
  const projectRoot =
    process.platform === 'win32' ? 'C:\\Users\\dev\\myproject' : '/home/dev/myproject'

  it('returns forward-slash relative paths (never absolute)', () => {
    const target = { name: 'auth', entry: 'src/auth/', description: '' }
    const result = resolveTargetPaths(target, projectRoot)
    expect(result).toEqual(['src/auth'])
    for (const p of result) {
      expect(p).not.toContain('\\')
      expect(p).not.toMatch(/^[A-Z]:/i) // not a Windows absolute path
      expect(p).not.toMatch(/^\//) // not a Unix absolute path
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
