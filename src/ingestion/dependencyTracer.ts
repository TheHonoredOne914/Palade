import { readFile } from 'node:fs/promises'
import { resolve, relative, dirname } from 'node:path'
import { existsSync } from 'node:fs'

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
    resolved = normalizedImport
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

    const importPaths = extractLocalImports(content)

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
        resolvedFromRoot.replace(/\.mjs$/, '.ts')
      ]

      const foundPath = candidates.find(p => existsSync(p))
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

function extractLocalImports(content: string): string[] {
  const imports: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const fromMatches = line.matchAll(/from\s+['"](\.[^'"]+)['"]/g)
    for (const match of fromMatches) {
      if (match[1]) imports.push(match[1])
    }

    const requireMatches = line.matchAll(/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)
    for (const match of requireMatches) {
      if (match[1] && !imports.includes(match[1])) {
        imports.push(match[1])
      }
    }

    const pyRelativeMatch = line.match(/from\s+(\.\S+)\s+import/)
    if (pyRelativeMatch && !imports.includes(pyRelativeMatch[1])) {
      imports.push(pyRelativeMatch[1])
    }
  }

  return imports
}
