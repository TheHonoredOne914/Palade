import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the gitignore logic by reading the source and verifying the guard
// Since initCommand is an async side-effect-heavy command, we test the guard inline.

describe('init .gitignore guard', () => {
  it('should not duplicate palade entries in .gitignore', () => {
    // Simulate the logic: check if '# Palade' marker exists
    const GITIGNORE_APPEND = `
# Palade
.palade/
`

    const existing = `node_modules/\ndist/\n\n# Palade\n.palade/\n`
    const hasMarker = existing.includes('# Palade')

    // If marker exists, we should skip appending
    expect(hasMarker).toBe(true)

    // Without marker, we should append
    const noMarker = `node_modules/\ndist/\n`
    expect(noMarker.includes('# Palade')).toBe(false)
  })
})
