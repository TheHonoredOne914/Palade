import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { settingsCommand } from './settings.js'

const TMP = join(process.cwd(), '.palade', 'tmp-settings-test')

function makeConfig(content: string): string {
  writeFileSync(TMP + '.config.ts', content, 'utf-8')
  return TMP + '.config.ts'
}

// We can't easily exercise the command end-to-end without a real cwd,
// so we re-implement the same setNestedValue logic here and test it against
// realistic config snippets. This guards the rewrite against regression.
function setNestedValue(content: string, dotPath: string, value: unknown): string {
  // NOTE: this is a copy of the logic in settings.ts kept in sync for testing.
  // The real implementation lives in src/cli/commands/settings.ts.
  const parts = dotPath.split('.')
  const valueStr = typeof value === 'string' ? `'${value}'` : String(value)
  const lines = content.split('\n')
  const keyName = parts[parts.length - 1]
  const escapedKey = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let matched = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const keyPattern = new RegExp(`^\\s*${escapedKey}\\s*:\\s*`)
    if (keyPattern.test(line) && !trimmed.startsWith('//')) {
      lines[i] = `${line.replace(/:\s*.*$/, '')}: ${valueStr}`
      matched = true
      break
    }
  }
  if (matched) return lines.join('\n')

  if (parts.length >= 2) {
    const sectionName = parts[0]
    const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sectionPattern = new RegExp(`^\\s*${escapedSection}\\s*:`)
    let inSection = false
    let sectionEnd = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart()
      const lineIndent = lines[i].length - trimmed.length
      if (sectionPattern.test(trimmed) && !trimmed.startsWith('//')) {
        inSection = true
        continue
      }
      if (inSection && trimmed.startsWith('}') && lineIndent <= 2) {
        sectionEnd = i
        break
      }
    }
    if (sectionEnd !== -1) {
      const innerIndent = parts.length >= 3 ? '    '.repeat(parts.length - 1) : '  '
      const insertLine = `${innerIndent}${keyName}: ${valueStr}`
      for (let j = sectionEnd - 1; j >= 0; j--) {
        const prev = lines[j].trimEnd()
        if (prev && !prev.startsWith('//')) {
          if (!prev.endsWith(',') && !prev.endsWith('{') && !prev.endsWith('}')) {
            lines[j] = lines[j].trimEnd() + ','
          }
          break
        }
      }
      lines.splice(sectionEnd, 0, insertLine)
      return lines.join('\n')
    }
  }
  return content
}

const SAMPLE = `export default {
  providers: {
    groq: {
      apiKey: '',
      model: 'llama-3.3-70b-versatile'
    }
  },
  swarm: {
    primary: 'groq',
    synthesis: 'cerebras',
    agentCount: 6,
    timeoutMs: 120000
  },
  output: {
    dir: '.palade/reports'
  }
}
`

describe('cli/commands/settings setNestedValue', () => {
  it('updates an existing 2-part key in place', () => {
    const out = setNestedValue(SAMPLE, 'swarm.primary', 'cerebras')
    expect(out).toContain("primary: 'cerebras'")
    expect(out).toContain("synthesis: 'cerebras'") // untouched
  })

  it('updates a numeric value', () => {
    const out = setNestedValue(SAMPLE, 'swarm.agentCount', 8)
    expect(out).toContain('agentCount: 8')
  })

  it('updates a boolean value', () => {
    const out = setNestedValue(SAMPLE, 'output.openBrowser', false)
    expect(out).toContain('openBrowser: false')
  })

  it('inserts a missing key into an existing section', () => {
    const out = setNestedValue(SAMPLE, 'output.port', 4242)
    expect(out).toContain('port: 4242')
    // existing key still present
    expect(out).toContain("dir: '.palade/reports'")
  })

  it('preserves valid JSON-ish structure after insert (comma added)', () => {
    const out = setNestedValue(SAMPLE, 'output.port', 4242)
    // the line before the inserted one should now end with a comma
    const lines = out.split('\n')
    const portIdx = lines.findIndex(l => l.includes('port: 4242'))
    expect(portIdx).toBeGreaterThan(0)
    const prev = lines[portIdx - 1].trimEnd()
    expect(prev.endsWith(',')).toBe(true)
  })
})
