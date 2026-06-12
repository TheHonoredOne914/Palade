import { readdir, stat, readFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import ignore, { Ignore } from 'ignore'
import type { FileManifest, Language, ScopeOptions } from './types.js'
import { parseFile } from './annotationParser.js'

const DEFAULT_IGNORES = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '*.lock',
  '*.min.js',
  '*.min.css',
  'coverage',
  '.palade'
]

const EXT_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust'
}

function detectLanguage(filePath: string): Language {
  const ext = extname(filePath)
  return EXT_MAP[ext] ?? 'unknown'
}

function matchesGlobs(filePath: string, globs: string[]): boolean {
  for (const pattern of globs) {
    if (filePath.includes(pattern.replace(/^\*/, ''))) return true
    if (filePath.startsWith(pattern.replace(/\/\*$/, '/'))) return true
  }
  return false
}

async function walkDir(
  dir: string,
  ig: Ignore,
  projectRoot: string
): Promise<FileManifest[]> {
  const results: FileManifest[] = []

  let entries: import('node:fs').Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    const relPath = relative(projectRoot, fullPath)

    if (ig.ignores(relPath)) continue

    if (entry.isDirectory()) {
      const subResults = await walkDir(fullPath, ig, projectRoot)
      results.push(...subResults)
      continue
    }

    if (!entry.isFile()) continue

    const language = detectLanguage(fullPath)
    if (language === 'unknown') continue

    let fileStat: import('node:fs').Stats
    try {
      fileStat = await stat(fullPath)
    } catch {
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
      path: relPath,
      absolutePath: fullPath,
      language,
      sizeBytes: fileStat.size,
      linesOfCode,
      annotations,
      lastModified: fileStat.mtime
    })
  }

  return results
}

export async function detectLanguages(
  projectRoot: string,
  scope: ScopeOptions
): Promise<Language[]> {
  const manifests = await walkProject(projectRoot, scope)
  const langs = [...new Set(
    manifests.map(m => m.language).filter((l): l is Language => l !== 'unknown')
  )]
  return langs.length > 0 ? langs : ['typescript']
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

  // Try to load .paladeignore
  try {
    const ignoreContent = await readFile(join(projectRoot, '.paladeignore'), 'utf-8')
    const customRules = ignoreContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
    for (const rule of customRules) {
      ig.add(rule)
    }
  } catch {
    // .paladeignore not found — use defaults only
  }

  // Walk all files
  let manifests = await walkDir(projectRoot, ig, projectRoot)

  // Apply scope filtering
  if (scope.dirs && scope.dirs.length > 0) {
    manifests = manifests.filter(m =>
      scope.dirs!.some(d => m.path.startsWith(d))
    )
  }

  if (scope.files && scope.files.length > 0) {
    const fileSet = new Set(scope.files)
    manifests = manifests.filter(m => fileSet.has(m.path))
  }

  if (scope.globs && scope.globs.length > 0) {
    manifests = manifests.filter(m => matchesGlobs(m.path, scope.globs!))
  }

  if (scope.targetPaths && scope.targetPaths.length > 0) {
    const targetSet = new Set(scope.targetPaths)
    manifests = manifests.filter(m => targetSet.has(m.path))
  }

  // annotationsOnly filter
  if (scope.annotationsOnly) {
    manifests = manifests.filter(m =>
      m.annotations.some(a => a.type !== 'ignore')
    )
  }

  // Sort by path
  manifests.sort((a, b) => a.path.localeCompare(b.path))

  return manifests
}
