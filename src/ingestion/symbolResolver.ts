import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
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

  const absolutePath = join(projectRoot, filePath)

  let content: string
  try {
    content = await readFile(absolutePath, 'utf-8')
  } catch {
    console.warn(`File not found: ${filePath}`)
    return null
  }

  const lines = content.split('\n')

  // Regex fallback: search for function/class declarations
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
        let endLine = lines.length - 1
        const indent = lines[i].search(/\S/)
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().length === 0) continue // skip blank lines
          const lineIndent = lines[j].search(/\S/)
          if (lineIndent !== -1 && lineIndent <= indent) {
            endLine = j - 1
            break
          }
        }

        const chunkContent = lines.slice(i, endLine + 1).join('\n')
        return {
          id: `${filePath}:${i + 1}-${endLine + 1}`,
          filePath,
          startLine: i + 1,
          endLine: endLine + 1,
          content: chunkContent,
          symbolName,
          tokenCount: Math.ceil(chunkContent.length / 4),
          language: getLanguage(filePath),
        }
      }
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
