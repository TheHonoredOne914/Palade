import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadCustomAgents } from './loader.js'
import { PaladeConfigError } from '../../errors/types.js'

let tmpRoot: string

function makeTmp(): string {
  // vitest runs under tsx via the root project; write a real .ts file and
  // import it through the project's tsx loader by pointing at an on-disk dir.
  const dir = join(
    process.cwd(),
    '.tmp-agents-loader-test',
    `t-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeAgents(content: string): void {
  writeFileSync(join(tmpRoot, 'palade.agents.ts'), content, 'utf-8')
}

beforeEach(() => {
  tmpRoot = makeTmp()
})

afterEach(() => {
  if (existsSync(tmpRoot)) rmSync(tmpRoot, { recursive: true, force: true })
})

describe('agents/custom/loader', () => {
  it('returns [] when no palade.agents.ts exists', async () => {
    // tmpRoot has no agents file
    expect(await loadCustomAgents(tmpRoot)).toEqual([])
  })

  it('loads valid custom agent definitions', async () => {
    writeAgents(`export default [
      { name: 'api-design', domain: 'API Design', systemPrompt: 'Review APIs.' },
    ]`)
    const agents = await loadCustomAgents(tmpRoot)
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe('api-design')
  })

  it('throws PaladeConfigError when the file exports a non-array (fail-fast)', async () => {
    writeAgents(`export default { name: 'not-an-array' }`)
    await expect(loadCustomAgents(tmpRoot)).rejects.toBeInstanceOf(PaladeConfigError)
  })

  it('throws PaladeConfigError when an entry has an empty systemPrompt (fail-fast)', async () => {
    writeAgents(`export default [
      { name: 'broken', domain: 'X', systemPrompt: '' },
    ]`)
    await expect(loadCustomAgents(tmpRoot)).rejects.toBeInstanceOf(PaladeConfigError)
  })

  it('throws PaladeConfigError when an entry collides with a built-in name', async () => {
    writeAgents(`export default [
      { name: 'security', domain: 'X', systemPrompt: 'p' },
    ]`)
    await expect(loadCustomAgents(tmpRoot)).rejects.toBeInstanceOf(PaladeConfigError)
  })

  it('throws PaladeConfigError on an unparseable / syntax-broken file', async () => {
    // A file that imports a non-existent symbol throws at import time; the
    // loader must surface this as a PaladeConfigError, not swallow it.
    writeAgents(`import { doesNotExist } from 'no-such-module'\nexport default [doesNotExist]`)
    await expect(loadCustomAgents(tmpRoot)).rejects.toBeInstanceOf(PaladeConfigError)
  })

  it('fail-fast error points at the agents field for clear rendering', async () => {
    writeAgents(`export default [ { name: 'broken', domain: 'X', systemPrompt: '' } ]`)
    try {
      await loadCustomAgents(tmpRoot)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PaladeConfigError)
      expect((e as PaladeConfigError).field).toBe('agents')
    }
  })
})

// Reference pathToFileURL to avoid an unused-import lint in environments that
// strip it; the import is retained for parity with the loader's own usage.
void pathToFileURL
