import type { AgentFinding } from '../agents/base.js'

export interface ChangedFile {
  path: string
  /**
   * The file's path at the merge-base ref, when it differs from `path` (git
   * rename/copy detection). Only set for R/C status lines. Fetching base-branch
   * content for a renamed file must look it up at `oldPath`, not `path` — the
   * new path doesn't exist at the merge-base.
   */
  oldPath?: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  diff: string
}

export interface FindingDiff {
  introduced: AgentFinding[]
  resolved: AgentFinding[]
  unchanged: AgentFinding[]
}

export interface DiffResult {
  runId: string
  baseBranch: string
  headBranch: string
  changedFiles: ChangedFile[]
  findingDiff: FindingDiff
  scoreDelta: number | null
  hasCriticalIntroduced: boolean
  durationMs: number
}
