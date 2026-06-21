import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import type { ChangedFile } from './types.js'

const GIT_STATUS_MAP: Record<string, ChangedFile['status']> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'modified',
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim()
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
    output = execSync(`git diff --name-status ${baseBranch}...HEAD`, {
      cwd,
      encoding: 'utf-8',
    })
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

    // Handle renamed files (R100\told\tnew)
    const filePath = statusChar === 'R' ? parts[2] : parts[1]
    if (!filePath) continue

    let additions = 0
    let deletions = 0
    let diff = ''

    if (status !== 'deleted') {
      try {
        diff = execSync(`git diff ${baseBranch}...HEAD -- "${filePath}"`, {
          cwd,
          encoding: 'utf-8',
        })

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
  // Try to read the history file as it exists on the base branch.
  // historyFile is typically gitignored (.palade/), so this returns null
  // unless the file was committed — in which case we get the real base score.
  const relPath = relative(cwd, historyFile).split(sep).join('/')
  try {
    const content = execSync(
      `git show ${baseBranch}:${relPath}`,
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const entries = JSON.parse(content) as Array<{ score: number; timestamp: string }>
    if (entries.length === 0) return null
    return entries[entries.length - 1].score
  } catch {
    // Not tracked on base branch — fall back to local history's last entry
    try {
      const content = readFileSync(historyFile, 'utf-8')
      const entries = JSON.parse(content) as Array<{ score: number; timestamp: string }>
      if (entries.length === 0) return null
      return entries[entries.length - 1].score
    } catch {
      return null
    }
  }
}
