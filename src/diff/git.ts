import { execFileSync } from 'node:child_process'
import { relative, sep } from 'node:path'
import type { ChangedFile } from './types.js'
import { parseHistoryEntries } from '../scorer/history.js'

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
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      encoding: 'utf-8',
    }).trim()
  } catch {
    return 'HEAD'
  }
}

export async function getChangedFiles(baseBranch: string, cwd: string): Promise<ChangedFile[]> {
  let output: string
  try {
    // Array form — bypasses the shell, so baseBranch cannot inject commands.
    output = execFileSync('git', ['diff', '--name-status', `${baseBranch}...HEAD`], {
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

    // Rename (R) and Copy (C) lines carry a score suffix and three columns:
    // `<status><score>\told\tnew`. The destination path is parts[2]; the
    // source path (parts[1]) is what exists at the merge-base ref, needed to
    // fetch pre-change content for a renamed/copied file.
    const isRenameOrCopy = statusChar === 'R' || statusChar === 'C'
    const filePath = isRenameOrCopy ? parts[2] : parts[1]
    const oldPath = isRenameOrCopy ? parts[1] : undefined
    if (!filePath) continue

    let additions = 0
    let deletions = 0
    let diff = ''

    if (status !== 'deleted') {
      try {
        diff = execFileSync('git', ['diff', `${baseBranch}...HEAD`, '--', filePath], {
          cwd,
          encoding: 'utf-8',
        })

        // Parse additions/deletions from diff. The real `+++`/`---` file
        // headers appear exactly once, before the first `@@` hunk marker —
        // after that, a line starting with `+++`/`---` is real added/deleted
        // content whose text happens to start with `++`/`--` (e.g. an added
        // `++counter;` line renders as `+++counter;`), so only special-case
        // the header lines before the first hunk.
        const diffLines = diff.split('\n')
        let seenHunk = false
        for (const dl of diffLines) {
          if (dl.startsWith('@@')) {
            seenHunk = true
            continue
          }
          if (!seenHunk && (dl.startsWith('+++') || dl.startsWith('---'))) continue
          if (dl.startsWith('+')) additions++
          else if (dl.startsWith('-')) deletions++
        }
      } catch {
        // Diff failed — file might be binary or newly added
      }
    }

    changedFiles.push({
      path: filePath,
      oldPath,
      status,
      additions,
      deletions,
      diff,
    })
  }

  return changedFiles
}

export async function getMergeBase(baseBranch: string, cwd: string): Promise<string | null> {
  try {
    return execFileSync('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Read a file's content as it existed at a given ref (commit-ish). Returns
 * null if the file didn't exist at that ref (e.g. it was added after the
 * base branch diverged) or the read otherwise fails (binary blob, etc.).
 */
export function getFileContentAtRef(ref: string, filePath: string, cwd: string): string | null {
  try {
    const posixPath = filePath.split(sep).join('/')
    return execFileSync('git', ['show', `${ref}:${posixPath}`], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 32,
    })
  } catch {
    return null
  }
}

export async function getBaseScore(
  baseBranch: string,
  historyFile: string,
  cwd: string
): Promise<number | null> {
  // Read the history file as it exists at the MERGE-BASE with the base branch,
  // matching getChangedFiles' triple-dot semantics. Reading the base branch's
  // current tip would attribute score movement from commits that landed on the
  // base after this branch diverged. historyFile is typically gitignored
  // (.palade/), so this returns null unless the file was committed.
  const relPath = relative(cwd, historyFile).split(sep).join('/')
  try {
    const mergeBase = execFileSync('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const content = execFileSync('git', ['show', `${mergeBase}:${relPath}`], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    // Only 'full' (whole-repo review) entries count as a baseline — a prior
    // `palade diff` run's changed-files-only score would be an apples-to-oranges
    // comparison.
    const entries = parseHistoryEntries(content).filter((e) => e.kind !== 'diff')
    if (entries.length === 0) return null
    return entries[entries.length - 1].score
  } catch {
    // Not tracked on base branch — no real base score available.
    return null
  }
}
