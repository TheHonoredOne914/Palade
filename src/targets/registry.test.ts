import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendTargetToFile } from './registry.js'

describe('appendTargetToFile source generation', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'palade-registry-'))
    mkdirSync(join(projectRoot, '.palade'), { recursive: true })
    writeFileSync(
      join(projectRoot, '.palade', 'palade.targets.ts'),
      'export default [\n]\n',
      'utf-8'
    )
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  // Extract the JS array literal from the generated TS module so we can
  // evaluate it and confirm the emitted source is valid and round-trips.
  function parseGeneratedTargets(): unknown {
    const content = readFileSync(join(projectRoot, '.palade', 'palade.targets.ts'), 'utf-8')
    const body = content.replace(/^\s*export default\s*/, '')
    // eslint-disable-next-line no-new-func
    return new Function(`return (${body})`)()
  }

  it('round-trips a target whose name/description contain quotes and newlines', () => {
    const target = {
      name: "weird'name",
      description: 'line one\nline two with "double" and \'single\' quotes',
      entry: ['src/a.ts', "src/b'with-quote.ts"],
      focus: ['edge\ncase'],
    }

    appendTargetToFile(projectRoot, target)

    const parsed = parseGeneratedTargets() as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe(target.name)
    expect(parsed[0].description).toBe(target.description)
    expect(parsed[0].entry).toEqual(target.entry)
    expect(parsed[0].focus).toEqual(target.focus)
  })

  it('round-trips a string entry', () => {
    const target = {
      name: 'simple',
      description: 'a simple target',
      entry: 'src/simple/',
    }

    appendTargetToFile(projectRoot, target)

    const parsed = parseGeneratedTargets() as Array<Record<string, unknown>>
    expect(parsed).toHaveLength(1)
    expect(parsed[0].entry).toBe('src/simple/')
  })
})
