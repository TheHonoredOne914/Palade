import { readFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import ts from 'typescript'
import type { CodeChunk } from './types.js'

export async function resolveSymbol(
  symbolRef: string,
  projectRoot: string
): Promise<CodeChunk | null> {
  const doubleColonIndex = symbolRef.indexOf('::')
  if (doubleColonIndex === -1) {
    console.warn(
      `Invalid symbol reference format: ${symbolRef}. Expected 'path/to/file::SymbolName'`
    )
    return null
  }

  const filePath = symbolRef.substring(0, doubleColonIndex)
  const symbolName = symbolRef.substring(doubleColonIndex + 2)

  const absolutePath = resolve(projectRoot, join(projectRoot, filePath))

  // Guard against path traversal — a symbolRef like "../../etc/passwd::root"
  // must not read files outside the project root.
  if (absolutePath !== projectRoot && !absolutePath.startsWith(projectRoot + sep)) {
    console.warn(`Symbol reference escapes project root: ${symbolRef}`)
    return null
  }

  let content: string
  try {
    content = await readFile(absolutePath, 'utf-8')
  } catch {
    console.warn(`File not found: ${filePath}`)
    return null
  }

  const language = getLanguage(filePath)
  const lines = content.split('\n')

  let startLine = -1
  let endLine = -1

  if (language === 'typescript' || language === 'javascript') {
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)

    // Only search top-level statements — recursing into nested scopes (e.g.
    // ts.forEachChild across an entire function body) could match a local
    // declaration that happens to share the target's name, returning the
    // wrong chunk for a file::Symbol lookup.
    function matchTopLevel(node: ts.Node): ts.Node | undefined {
      let nodeName = ''
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)
      ) {
        nodeName = node.name?.text ?? ''
      } else if (ts.isVariableStatement(node)) {
        // Check every declarator — `const a = 1, target = 2` declares both
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === symbolName) {
            nodeName = decl.name.text
            break
          }
        }
      }
      return nodeName === symbolName ? node : undefined
    }

    let foundNode: ts.Node | undefined
    for (const stmt of sourceFile.statements) {
      foundNode = matchTopLevel(stmt)
      if (foundNode) break
    }

    if (foundNode) {
      // getStart(sourceFile, true) includes leading trivia (JSDoc/lead
      // comments), matching chunker.ts's finishChunk() — plain getStart()
      // skips straight to the first non-trivia token and silently dropped a
      // resolved symbol's doc comment (ingest-002).
      const start = sourceFile.getLineAndCharacterOfPosition(foundNode.getStart(sourceFile, true))
      const end = sourceFile.getLineAndCharacterOfPosition(foundNode.getEnd())
      startLine = start.line
      endLine = end.line
    }
  }

  if (startLine === -1) {
    // Regex fallback: search for function/class declarations for python/go/rust etc, or if TS parsing failed
    const patterns = [
      new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegex(symbolName)}\\s*\\(`),
      new RegExp(`(?:export\\s+)?class\\s+${escapeRegex(symbolName)}\\s`),
      new RegExp(`(?:export\\s+)?const\\s+${escapeRegex(symbolName)}\\s*=\\s*(?:async\\s+)?\\(`),
      new RegExp(`(?:def|async\\s+def)\\s+${escapeRegex(symbolName)}\\s*\\(`),
      new RegExp(`(?:class)\\s+${escapeRegex(symbolName)}\\s*[:(]`),
    ]

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          endLine = lines.length - 1
          const indent = lines[i].search(/\S/)
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim().length === 0) continue // skip blank lines
            const lineIndent = lines[j].search(/\S/)
            if (lineIndent !== -1 && lineIndent <= indent) {
              endLine = j - 1
              break
            }
          }
          startLine = i
          break
        }
      }
      if (startLine !== -1) break
    }
  }

  if (startLine !== -1 && endLine !== -1) {
    const chunkContent = lines.slice(startLine, endLine + 1).join('\n')
    return {
      id: `${filePath}:${startLine + 1}-${endLine + 1}`,
      filePath,
      startLine: startLine + 1,
      endLine: endLine + 1,
      content: chunkContent,
      symbolName,
      tokenCount: Math.ceil(chunkContent.length / 4),
      language,
    }
  }

  console.warn(`Symbol '${symbolName}' not found in ${filePath}`)
  return null
}

function getLanguage(filePath: string): CodeChunk['language'] {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript'
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs'))
    return 'javascript'
  if (filePath.endsWith('.py')) return 'python'
  if (filePath.endsWith('.go')) return 'go'
  if (filePath.endsWith('.rs')) return 'rust'
  return 'unknown'
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
