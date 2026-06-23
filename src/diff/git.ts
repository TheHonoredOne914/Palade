import { execFileSync } from 'node:child_process'
import { relative, sep } from 'node:path'
import type { ChangedFile } from './types.js'

const GIT_STATUS_MAP: Record<string, ChangedFile['status']> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'modified',
  // Copy (C) is treated as a modification of the destination file.
  C: 'modified',
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    return execFileSync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd, encoding: 'utf-8' }
    ).trim()
  } catch {
    return 'HEAD'
  }
}

export async function getChangedFiles(
  baseBranch: string,
  cwd: string
): Promise<ChangedFile[]> {
  let output: string
  try {
    // Array form — bypasses the shell, so baseBranch cannot inject commands.
    output = execFileSync(
      'git',
      ['diff', '--name-status', `${baseBranch}...HEAD`],
      { cwd, encoding: 'utf-8' }
    )
  } catch {
    return []
  }

  const lines = output.trim().split('\n').filter(Boolean)
  const changedFiles: ChangedFile[] = []

  for (const line of lines) {
    const parts = line.split('\t')
    const statusCode = parts[0]
    const statusChar = statusCode.charAt(0)
    const status = GIT_STATUS_MAP[statusChar] ?? 'modified'

    // Rename (R) and Copy (C) lines carry a score suffix and three columns:
    // `<status><score>\told\tnew`. The destination path is parts[2].
    const filePath = statusChar === 'R' || statusChar === 'C' ? parts[2] : parts[1]
    if (!filePath) continue

    let additions = 0
    let deletions = 0
    let diff = ''

    if (status !== 'deleted') {
      try {
        diff = execFileSync(
          'git',
          ['diff', `${baseBranch}...HEAD`, '--', filePath],
          { cwd, encoding: 'utf-8' }
        )

        // Parse additions/deletions from diff
        const diffLines = diff.split('\n')
        for (const dl of diffLines) {
          if (dl.startsWith('+') && !dl.startsWith('+++')) additions++
          if (dl.startsWith('-') && !dl.startsWith('---')) deletions++
        }
      } catch {
        // Diff failed — file might be binary or newly added
      }
    }

    changedFiles.push({
      path: filePath,
      status,
      additions,
      deletions,
      diff,
    })
  }

  return changedFiles
}

export async function getBaseScore(
  baseBranch: string,
  historyFile: string,
  cwd: string
): Promise<number | null> {
  // Read the history file as it exists on the base branch. historyFile is
  // typically gitignored (.palade/), so this returns null unless the file was
  // committed — in which case we get the real base score.
  const relPath = relative(cwd, historyFile).split(sep).join('/')
  try {
    const content = execFileSync(
      'git',
      ['show', `${baseBranch}:${relPath}`],
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const entries = JSON.parse(content) as Array<{ score: number; timestamp: string }>
    if (entries.length === 0) return null
    return entries[entries.length - 1].score
  } catch {
    // Not tracked on base branch — no real base score available.
    return null
  }
}
