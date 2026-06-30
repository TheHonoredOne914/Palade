import { readdir, stat, readFile, realpath } from 'node:fs/promises'
import { join, relative, extname, sep } from 'node:path'
import ignore, { Ignore } from 'ignore'
import type { FileManifest, Language, ScopeOptions, LanguageProfile } from './types.js'
import { parseFile } from './annotationParser.js'
import { WorkspaceTooLargeError } from '../errors/types.js'

const DEFAULT_IGNORES = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '*.lock',
  '*.min.js',
  '*.min.css',
  'coverage',
  '.palade',
]

const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
}

function detectLanguage(filePath: string): Language {
  const ext = extname(filePath)
  return EXT_MAP[ext] ?? 'unknown'
}

function matchesGlobs(filePath: string, globs: string[]): boolean {
  for (const pattern of globs) {
    // *.ext — suffix match (e.g. "*.service.ts" matches "src/x.service.ts")
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1) // keep the leading "."
      if (filePath.endsWith(suffix)) return true
      continue
    }
    // dir/** — recursive directory match
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3) // remove '/**'
      if (filePath.startsWith(prefix + '/') || filePath === prefix) return true
      continue
    }
    // dir/* or dir/ — prefix match on a path segment boundary
    if (pattern.endsWith('/*') || pattern.endsWith('/')) {
      const prefix = pattern.replace(/\/?\*?$/, '/')
      if (filePath.startsWith(prefix) || filePath.includes('/' + prefix)) return true
      continue
    }
    // Literal substring (covers "src/foo.ts", "auth", etc.)
    if (filePath === pattern || filePath.endsWith('/' + pattern)) return true
  }
  return false
}

async function walkDir(
  dir: string,
  ig: Ignore,
  projectRoot: string,
  state: { visitedDirs: Set<string>; filesScanned: number }
): Promise<FileManifest[]> {
  const results: FileManifest[] = []

  // Resolve the canonical path of this directory so we can detect cycles.
  // A symlink loop (common under node_modules / tooling caches) would otherwise
  // recurse until the stack overflows.
  let realDir: string
  try {
    realDir = await realpath(dir)
  } catch {
    return results
  }
  if (state.visitedDirs.has(realDir)) return results
  state.visitedDirs.add(realDir)

  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(projectRoot, fullPath).split('\\').join('/')

    if (ig.ignores(relPath)) continue

    if (entry.isDirectory()) {
      const subResults = await walkDir(fullPath, ig, projectRoot, state)
      results.push(...subResults)
      continue
    }

    // Skip symlinks pointing to non-files (sockets, pipes, etc.) and dangling
    // symlinks — entry.isFile() is false for those, and we never want to
    // follow a symlinked file into a different location than its target logic.
    if (!entry.isFile()) continue

    const language = detectLanguage(fullPath)
    if (language === 'unknown') continue

    let fileStat: import('node:fs').Stats
    try {
      fileStat = await stat(fullPath)
    } catch {
      continue
    }

    state.filesScanned++
    if (state.filesScanned > 20000) {
      throw new WorkspaceTooLargeError(20000)
    }

    if (fileStat.size > 2 * 1024 * 1024) {
      // Skip files > 2MB to prevent memory exhaustion
      continue
    }

    let content: string
    try {
      content = await readFile(fullPath, 'utf-8')
    } catch {
      continue
    }

    const linesOfCode = content.split('\n').length
    const annotations = await parseFile(fullPath, language === 'python')

    results.push({
      path: relPath.split(sep).join('/'),
      absolutePath: fullPath,
      language,
      sizeBytes: fileStat.size,
      linesOfCode,
      annotations,
      lastModified: fileStat.mtime,
    })
  }

  return results
}

export async function detectLanguages(
  projectRoot: string,
  scope: ScopeOptions
): Promise<LanguageProfile> {
  const manifests = await walkProject(projectRoot, scope)
  const langs = [
    ...new Set(manifests.map((m) => m.language).filter((l): l is Language => l !== 'unknown')),
  ]

  const primary = (langs.length > 0 ? langs : ['typescript']) as Language[]
  const isFirstClass = primary.includes('typescript') || primary.includes('javascript')

  return {
    primary,
    isFirstClass,
  }
}

export async function walkProject(
  projectRoot: string,
  scope: ScopeOptions
): Promise<FileManifest[]> {
  // Build ignore rules
  const ig = ignore()

  // Add default ignores
  for (const pattern of DEFAULT_IGNORES) {
    ig.add(pattern)
  }

  // Try to load .palade/ignore
  try {
    let ignoreContent = ''
    try {
      ignoreContent = await readFile(join(projectRoot, '.palade', 'ignore'), 'utf-8')
    } catch {
      ignoreContent = await readFile(join(projectRoot, '.paladeignore'), 'utf-8')
    }
    const customRules = ignoreContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    for (const rule of customRules) {
      ig.add(rule.replace(/\r/g, ''))
    }
  } catch {
    // .palade/ignore not found — use defaults only
  }

  // Also load .gitignore if present
  try {
    const gitignoreContent = await readFile(join(projectRoot, '.gitignore'), 'utf-8')
    const gitRules = gitignoreContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    for (const rule of gitRules) {
      ig.add(rule.replace(/\r/g, ''))
    }
  } catch {
    // .gitignore not found — continue
  }

  // 2. Start walk
  const state = { visitedDirs: new Set<string>(), filesScanned: 0 }
  let manifests = await walkDir(projectRoot, ig, projectRoot, state)

  // 3. Apply target / glob scoping (unless doing annotations only which scopes later)
  if (scope.dirs && scope.dirs.length > 0) {
    manifests = manifests.filter((m) =>
      scope.dirs!.some((d) => m.path === d || m.path.startsWith(d + '/'))
    )
  }

  if (scope.files && scope.files.length > 0) {
    const fileSet = new Set(scope.files)
    manifests = manifests.filter((m) => fileSet.has(m.path))
  }

  if (scope.globs && scope.globs.length > 0) {
    manifests = manifests.filter((m) => matchesGlobs(m.path, scope.globs!))
  }

  if (scope.targetPaths && scope.targetPaths.length > 0) {
    manifests = manifests.filter((m) =>
      scope.targetPaths!.some((t) => m.path === t || m.path.startsWith(t + '/'))
    )
  }

  // annotationsOnly filter
  if (scope.annotationsOnly) {
    manifests = manifests.filter((m) => m.annotations.some((a) => a.type !== 'ignore'))
  }

  // Sort by path
  manifests.sort((a, b) => a.path.localeCompare(b.path))

  return manifests
}
