import type { AgentFinding } from '../agents/base.js'

export interface ChangedFile {
  path: string
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
