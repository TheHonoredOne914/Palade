import { readFile } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import ts from 'typescript'

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function resolveImport(fromFile: string, importPath: string, projectRoot: string): string {
  const fileDir = dirname(fromFile)
  const normalizedDir = normalizePath(fileDir)
  const normalizedImport = normalizePath(importPath)

  let resolved: string
  if (normalizedImport.startsWith('./') || normalizedImport.startsWith('../')) {
    const parts = [...normalizedDir.split('/'), ...normalizedImport.split('/')]
    const resolvedParts: string[] = []
    for (const part of parts) {
      if (part === '..') resolvedParts.pop()
      else if (part !== '.' && part !== '') resolvedParts.push(part)
    }
    resolved = resolvedParts.join('/')
  } else {
    // Package import (not local) — resolve against projectRoot
    resolved = normalizedImport
  }

  // Guard against path traversal
  const resolvedAbs = resolve(projectRoot, resolved)
  if (!resolvedAbs.startsWith(projectRoot)) {
    return projectRoot // refuse traversal
  }

  return resolve(projectRoot, resolved)
}

export async function traceDependencies(
  filePath: string,
  projectRoot: string,
  depth: number = 1
): Promise<string[]> {
  const visited = new Set<string>()
  const results: string[] = []

  async function trace(currentPath: string, currentDepth: number): Promise<void> {
    if (currentDepth > depth) return

    const normalizedCurrent = normalizePath(currentPath)
    if (visited.has(normalizedCurrent)) return
    visited.add(normalizedCurrent)

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
      const pyRelativeMatch = line.match(/from\s+(\.\S+)\s+import/)
      if (pyRelativeMatch && !imports.includes(pyRelativeMatch[1])) {
        imports.push(pyRelativeMatch[1])
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
