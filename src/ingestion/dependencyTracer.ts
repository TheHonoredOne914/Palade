import { readFile } from 'node:fs/promises'
import { resolve, relative, dirname, sep } from 'node:path'
import { existsSync } from 'node:fs'
import ts from 'typescript'

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
  const results: string[] = []

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
        resolvedFromRoot + '.py',
        resolvedFromRoot.replace(/\.js$/, '.ts'),
        resolvedFromRoot.replace(/\.js$/, '.tsx'),
        resolvedFromRoot.replace(/\.mjs$/, '.ts'),
      ]

      const foundPath = candidates.find((p) => existsSync(p))
      if (!foundPath) continue

      const relFromRoot = normalizePath(relative(projectRoot, foundPath))
      if (!results.includes(relFromRoot)) {
        results.push(relFromRoot)
      }

      if (currentDepth < depth) {
        await trace(relFromRoot, currentDepth + 1)
      }
    }
  }

  await trace(filePath, 1)
  return results
}

function extractLocalImports(content: string, filePath: string): string[] {
  const imports: string[] = []

  if (filePath.endsWith('.py')) {
    // python fallback
    const lines = content.split('\n')
    for (const line of lines) {
      const pyRelativeMatch = line.match(/from\s+(\.+[\w.]*)\s+import\s+([\w*, ]+)/)
      if (pyRelativeMatch) {
        const modulePart = pyRelativeMatch[1]
        if (/^\.+$/.test(modulePart)) {
          // Bare `from . import x, y` — the imported names are the modules
          for (const name of pyRelativeMatch[2].split(',')) {
            const trimmed = name.trim()
            if (trimmed && trimmed !== '*' && !imports.includes(modulePart + trimmed)) {
              imports.push(modulePart + trimmed)
            }
          }
        } else if (!imports.includes(modulePart)) {
          imports.push(modulePart)
        }
      }
    }
    return imports
  }

  // Use typescript for .ts, .js, .tsx, .jsx
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const moduleSpecifier = node.moduleSpecifier
      if (ts.isStringLiteral(moduleSpecifier)) {
        if (moduleSpecifier.text.startsWith('.')) {
          imports.push(moduleSpecifier.text)
        }
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile) === 'require' &&
      node.arguments.length === 1
    ) {
      const arg = node.arguments[0]
      if (ts.isStringLiteral(arg) && arg.text.startsWith('.')) {
        imports.push(arg.text)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  // Deduplicate
  return Array.from(new Set(imports))
}
