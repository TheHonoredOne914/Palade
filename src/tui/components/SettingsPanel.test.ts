import { describe, it, expect } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { toTsStringLiteral, readCurrentKeys } from './SettingsPanel.js'

describe('toTsStringLiteral', () => {
  it('wraps a plain value in single quotes', () => {
    expect(toTsStringLiteral('abc123')).toBe("'abc123'")
  })

  it('escapes single quotes so the literal cannot break out', () => {
    expect(toTsStringLiteral("a'b")).toBe("'a\\'b'")
  })

  it('escapes backslashes', () => {
    expect(toTsStringLiteral('a\\b')).toBe("'a\\\\b'")
  })

  it('does not escape double quotes inside a single-quoted literal', () => {
    expect(toTsStringLiteral('a"b')).toBe("'a\"b'")
  })

  it('escapes newlines rather than emitting a raw line break', () => {
    expect(toTsStringLiteral('a\nb')).toBe("'a\\nb'")
  })

  it('produces a literal that evals back to the original for injection-y input', () => {
    const nasty = "x'; console.log('pwned'); const y='"
    const literal = toTsStringLiteral(nasty)
    // eslint-disable-next-line no-eval
    const roundTripped = eval(literal) as string
    expect(roundTripped).toBe(nasty)
  })

  it('handles backtick/template-injection attempts safely', () => {
    const nasty = '${process.exit(1)}`'
    const literal = toTsStringLiteral(nasty)
    // eslint-disable-next-line no-eval
    expect(eval(literal)).toBe(nasty)
  })
})

describe('readCurrentKeys round-trip', () => {
  it('extracts a key written with an escaped single quote', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-settings-'))
    try {
      const key = "sk-live-'quote'-value"
      const config = [
        '// palade.config.ts',
        'export default {',
        '  providers: {',
        `    'groq': {`,
        `      apiKey: ${toTsStringLiteral(key)},`,
        `      model: 'llama-3.3-70b-versatile'`,
        '    },',
        '  },',
        '}',
        '',
      ].join('\n')
      await writeFile(join(dir, 'palade.config.ts'), config, 'utf-8')

      const keys = await readCurrentKeys(dir)
      expect(keys.groq).toBe(key)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it.each([
    'plainkey',
    "sk-'quoted'",
    'sk-with-$1-$2-dollars',
    'sk-with-"double"-quotes',
    'sk-back\\slash',
    'sk-back\\slash\'and-quote',
    'sk-with`backtick`',
  ])('round-trips %j through write and read', async (key) => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-settings-'))
    try {
      const config = [
        'export default {',
        '  providers: {',
        `    'groq': {`,
        `      apiKey: ${toTsStringLiteral(key)},`,
        `      model: 'llama-3.3-70b-versatile'`,
        '    },',
        '  },',
        '}',
        '',
      ].join('\n')
      await writeFile(join(dir, 'palade.config.ts'), config, 'utf-8')
      const keys = await readCurrentKeys(dir)
      expect(keys.groq).toBe(key)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns an empty record when no config exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-settings-'))
    try {
      const keys = await readCurrentKeys(dir)
      expect(keys).toEqual({})
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
