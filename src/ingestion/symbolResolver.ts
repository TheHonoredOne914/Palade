import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CodeChunk } from './types.js'

let tsParser: any = null
let jsParser: any = null
let pyParser: any = null

async function loadTreeSitter(): Promise<boolean> {
  try {
    const TreeSitter = (await import('tree-sitter')).default
    if (!TreeSitter) return false

    const tsModule = (await import('tree-sitter-typescript')).default
    const TypeScriptLang = tsModule.typescript
    const JavaScriptLang = (await import('tree-sitter-javascript')).default
    const PythonLang = (await import('tree-sitter-python')).default

    const tsP = new TreeSitter()
    tsP.setLanguage(TypeScriptLang)
    tsParser = tsP

    const jsP = new TreeSitter()
    jsP.setLanguage(JavaScriptLang)
    jsParser = jsP

    const pyP = new TreeSitter()
    pyP.setLanguage(PythonLang)
    pyParser = pyP

    return true
  } catch {
    return false
  }
}

let treeSitterLoaded: boolean | null = null

export async function resolveSymbol(
  symbolRef: string,
  projectRoot: string
): Promise<CodeChunk | null> {
  if (treeSitterLoaded === null) {
    treeSitterLoaded = await loadTreeSitter()
  }

  const doubleColonIndex = symbolRef.indexOf('::')
  if (doubleColonIndex === -1) {
    console.warn(`Invalid symbol reference format: ${symbolRef}. Expected 'path/to/file::SymbolName'`)
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

  // Try tree-sitter parsing
  if (treeSitterLoaded) {
    try {
      let parser: any = null
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        parser = tsParser
      } else if (filePath.endsWith('.py')) {
        parser = pyParser
      } else {
        parser = jsParser
      }

      if (parser) {
        const tree = parser.parse(content)

        function findSymbol(node: any): CodeChunk | null {
          if (!node) return null

          const type = node.type
          const isTarget =
            (type === 'function_declaration' ||
             type === 'class_declaration' ||
             type === 'method_definition' ||
             type === 'function_definition' ||
             type === 'class_definition') &&
            node.childCount > 0

          if (isTarget) {
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i)
              if (child && (child.type === 'identifier' || child.type === 'property_identifier' || child.type === 'type_identifier')) {
                if (child.text === symbolName) {
                  const startLine = node.startPosition.row + 1
                  const endLine = node.endPosition.row + 1
                  const chunkContent = lines.slice(startLine - 1, endLine).join('\n')

                  return {
                    id: `${filePath}:${startLine}-${endLine}`,
                    filePath,
                    startLine,
                    endLine,
                    content: chunkContent,
                    symbolName,
                    tokenCount: Math.ceil(chunkContent.length / 4),
                    language: getLanguage(filePath)
                  }
                }
              }
            }
          }

          for (let i = 0; i < node.childCount; i++) {
            const result = findSymbol(node.child(i))
            if (result) return result
          }

          return null
        }

        const result = findSymbol(tree.rootNode)
        if (result) return result
      }
    } catch {
      // Fall through to regex fallback
    }
  }

  // Regex fallback: search for function/class declarations
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegex(symbolName)}\\s*\\(`),
    new RegExp(`(?:export\\s+)?class\\s+${escapeRegex(symbolName)}\\s`),
    new RegExp(`(?:export\\s+)?const\\s+${escapeRegex(symbolName)}\\s*=\\s*(?:async\\s+)?\\(`),
    new RegExp(`(?:def|async\\s+def)\\s+${escapeRegex(symbolName)}\\s*\\(`),
    new RegExp(`(?:class)\\s+${escapeRegex(symbolName)}\\s*[:(]`)
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
          language: getLanguage(filePath)
        }
      }
    }
  }

  console.warn(`Symbol '${symbolName}' not found in ${filePath}`)
  return null
}

function getLanguage(filePath: string): CodeChunk['language'] {
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript'
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.mjs')) return 'javascript'
  if (filePath.endsWith('.py')) return 'python'
  if (filePath.endsWith('.go')) return 'go'
  if (filePath.endsWith('.rs')) return 'rust'
  return 'unknown'
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
