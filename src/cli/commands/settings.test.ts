import { describe, it, expect } from 'vitest'
import { setNestedValue } from './settings.js'

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

  it('targets a 3-part nested key, not the first match of the leaf name', () => {
    // Config with "model:" at TWO different nesting depths.
    const nested = `export default {
  providers: {
    groq: {
      model: 'groq-default',
      settings: {
        model: 'inner-model'
      }
    }
  }
}
`
    const out = setNestedValue(nested, 'providers.groq.model', 'new-model')
    expect(out).toContain("model: 'new-model'")
    // The inner "settings.model" must be untouched.
    expect(out).toContain("model: 'inner-model'")
    expect(out).not.toContain("model: 'groq-default'")
  })

  it('updates a deeply nested key (3 parts)', () => {
    const nested = `export default {
  providers: {
    groq: {
      model: 'old',
      apiKey: 'key'
    }
  }
}
`
    const out = setNestedValue(nested, 'providers.groq.model', 'new')
    expect(out).toContain("model: 'new'")
    expect(out).toContain("apiKey: 'key'")
  })
})
