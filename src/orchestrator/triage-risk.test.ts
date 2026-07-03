import { describe, expect, it } from 'vitest'
import { scoreManifestForReview } from './triage.js'
import type { FileManifest } from '../ingestion/types.js'

function manifest(path: string, linesOfCode = 50): FileManifest {
  return {
    path,
    absolutePath: `C:/repo/${path}`,
    language: 'typescript',
    sizeBytes: linesOfCode * 40,
    linesOfCode,
    annotations: [],
    lastModified: new Date('2026-01-01T00:00:00.000Z'),
  }
}

describe('orchestrator/triage risk scoring', () => {
  it('prioritizes runtime and permission-sensitive files over harmless helpers', () => {
    const runtime = scoreManifestForReview(manifest('src/internal/runtime/vm.ts'))
    const permission = scoreManifestForReview(manifest('src/policies/rbac.ts'))
    const helper = scoreManifestForReview(manifest('src/components/formatLabel.ts'))

    expect(runtime).toBeGreaterThan(helper)
    expect(permission).toBeGreaterThan(helper)
  })

  it('does not demote security boundary DTOs like ordinary type-only files', () => {
    const authDto = scoreManifestForReview(manifest('src/auth/login.dto.ts'))
    const plainTypes = scoreManifestForReview(manifest('src/types/theme.ts'))

    expect(authDto).toBeGreaterThan(plainTypes)
  })
})
