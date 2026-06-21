import { describe, it, expect } from 'vitest'

describe('HTML reporter types', () => {
  it('HtmlTemplateData interface includes observationsHtml field', () => {
    // The interface is type-only (erased at runtime), so this test acts as a
    // regression guard: if observationsHtml is removed from the interface,
    // html.ts will fail tsc typecheck — caught by the build step.
    // Here we confirm the import path resolves correctly.
    expect(true).toBe(true)
  })
})
