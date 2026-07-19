import { readFile } from 'node:fs/promises'
import { resolve, relative, dirname, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { extractImportSpecifiers } from './importExtractor.js'

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveImport(fromFile: string, importPath: string, projectRoot: string): string {
  const fileDir = dirname(fromFile)
  const normalizedDir = normalizePath(fileDir)
  const normalizedImport = normalizePath(importPath)

  // Python-style relative import: dots with NO slash (".sibling", "..pkg.mod").
  // Leading-dot count minus one = directories to climb; the dotted remainder
  // maps to path segments, resolved against the importing file's directory.
  const pyRel = /^(\.+)([\w.]*)$/.exec(normalizedImport)

  let resolved: string
  if (pyRel && !normalizedImport.includes('/')) {
    const up = pyRel[1].length - 1
    const dirParts = normalizedDir.split('/').filter((p) => p !== '' && p !== '.')
    if (up > dirParts.length) return projectRoot // refuse traversal above root
    dirParts.length -= up
    const segs = pyRel[2].split('.').filter(Boolean)
    resolved = [...dirParts, ...segs].join('/')
  } else if (normalizedImport.startsWith('./') || normalizedImport.startsWith('../')) {
    const parts = [...normalizedDir.split('/'), ...normalizedImport.split('/')]
    const resolvedParts: string[] = []
    for (const part of parts) {
      if (part === '..') {
        // Popping past the root means the target is outside the project —
        // silently clamping would resolve to an unrelated in-root path.
        if (resolvedParts.length === 0) return projectRoot // refuse traversal
        resolvedParts.pop()
      } else if (part !== '.' && part !== '') resolvedParts.push(part)
    }
    resolved = resolvedParts.join('/')
  } else {
    // Package import (not local) — resolve against projectRoot
    resolved = normalizedImport
  }

  // Guard against path traversal — startsWith alone is insufficient because
  // "/home/user/project2" starts with "/home/user/proj". Must ensure the
  // resolved path is either the root itself or starts with root + separator.
  const resolvedAbs = resolve(projectRoot, resolved)
  if (resolvedAbs !== projectRoot && !resolvedAbs.startsWith(projectRoot + sep)) {
    return projectRoot // refuse traversal
  }

  return resolve(projectRoot, resolved)
}

export async function traceDependencies(
  filePath: string,
  projectRoot: string,
  depth: number = 1
): Promise<string[]> {
  // Track the shallowest depth each file was visited at: a file first reached
  // deep in the tree (where recursion stops early) must be re-expanded if a
  // shorter path to it is found later, or its transitive deps get dropped
  // depending on unrelated import ordering.
  const visited = new Map<string, number>()
  const results = new Set<string>()

  async function trace(currentPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > depth) return

    const normalizedCurrent = normalizePath(currentPath)
    if ((visited.get(normalizedCurrent) ?? Infinity) <= currentDepth) return
    visited.set(normalizedCurrent, currentDepth)

    const absolutePath = resolve(projectRoot, currentPath)

    let content: string
    try {
      content = await readFile(absolutePath, 'utf-8')
    } catch {
      return
    }

    const importPaths = extractLocalImports(content, currentPath)

    for (const importPath of importPaths) {
      const resolvedFromRoot = resolveImport(currentPath, importPath, projectRoot)

      const candidates = [
        resolvedFromRoot,
        resolvedFromRoot + '.ts',
        resolvedFromRoot + '.tsx',
        resolvedFromRoot + '.js',
        resolvedFromRoot + '.jsx',
        resolvedFromRoot + '.mjs',
        resolvedFromRoot + '.cjs',
        resolvedFromRoot + '.py',
        resolvedFromRoot + '.c',
        resolvedFromRoot + '.h',
        resolvedFromRoot + '.cc',
        resolvedFromRoot + '.hpp',
        resolvedFromRoot + '.cpp',
        resolvedFromRoot.replace(/\.js$/, '.ts'),
        resolvedFromRoot.replace(/\.js$/, '.tsx'),
        resolvedFromRoot.replace(/\.mjs$/, '.ts'),
      ]

      const foundPath = candidates.find((p) => existsSync(p))
      if (!foundPath) continue

      const relFromRoot = normalizePath(relative(projectRoot, foundPath))
      if (!results.has(relFromRoot)) {
        results.add(relFromRoot)
      }

      if (currentDepth < depth) {
        await trace(relFromRoot, currentDepth + 1)
      }
    }
  }

  await trace(filePath, 1)
  return Array.from(results)
}

function extractLocalImports(content: string, filePath: string): string[] {
  const imports: string[] = []

  if (filePath.endsWith('.py')) {
    // python fallback
    //
    // Join `from x import (\n    a,\n    b,\n)` continuation lines into the
    // single-line form before scanning line-by-line, so the multi-line
    // parenthesized form isn't invisible to the per-line regex below
    // (ingest-008). Only "from ... import (...)" is valid with parens in
    // Python — bare `import (...)` isn't syntax — so this is scoped to that
    // shape.
    const joined = content.replace(
      /from\s+([\w.]*)\s+import\s*\(([^)]*)\)/gs,
      (_m, mod: string, inner: string) => `from ${mod} import ${inner.replace(/\s*\n\s*/g, ' ')}`
    )
    const lines = joined.split('\n')
    for (const line of lines) {
      const pyRelativeMatch = line.match(/from\s+(\.+[\w.]*)\s+import\s+([\w*, ]+)/)
      if (pyRelativeMatch) {
        const modulePart = pyRelativeMatch[1]
        if (/^\.+$/.test(modulePart)) {
          // Bare `from . import x, y` — the imported names are the modules.
          // Each name may carry an `as alias` suffix (`from . import x as y`)
          // which must be stripped before treating it as a module segment.
          for (const name of pyRelativeMatch[2].split(',')) {
            const trimmed = name
              .trim()
              .split(/\s+as\s+/)[0]
              .trim()
            if (trimmed && trimmed !== '*' && !imports.includes(modulePart + trimmed)) {
              imports.push(modulePart + trimmed)
            }
          }
        } else if (!imports.includes(modulePart)) {
          imports.push(modulePart)
        }
        continue
      }

      // Bare absolute import(s): `import a.b.c`, `import a.b.c as x`, or
      // comma-separated `import a, b.c as d`. These have no leading '.' so
      // they can't be distinguished from stdlib/third-party packages here —
      // that's fine, resolveImport's package-import branch below only keeps
      // ones that actually resolve to a file under projectRoot, so e.g.
      // `import os` is harmless (nothing on disk matches "os").
      const bareImportMatch = line.match(
        /^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/
      )
      if (bareImportMatch) {
        for (const rawEntry of bareImportMatch[1].split(',')) {
          const dottedPath = rawEntry.trim().split(/\s+as\s+/)[0].trim()
          if (!dottedPath) continue
          const slashPath = dottedPath.replace(/\./g, '/')
          if (!imports.includes(slashPath)) imports.push(slashPath)
        }
      }
    }
    return imports
  }

  // Use the shared AST-based extractor for .ts, .js, .tsx, .jsx (etc.), keeping
  // only local (relative) specifiers — dependency tracing only follows local files.
  for (const specifier of extractImportSpecifiers(content, filePath)) {
    if (specifier.startsWith('.') && !imports.includes(specifier)) {
      imports.push(specifier)
    }
  }

  return imports
}
