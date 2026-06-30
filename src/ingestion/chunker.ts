import { readFile } from 'node:fs/promises'
import type { FileManifest, CodeChunk } from './types.js'
import { traceDependencies } from './dependencyTracer.js'
import { resolve } from 'node:path'

const MAX_TOKENS = 6000
const CHUNK_LINES = 150
const CHUNK_OVERLAP = 30
const CHARS_PER_TOKEN = 4
const MAX_TREE_SITTER_LINES = 3000
const MAX_CHUNKS_PER_FILE = 50
const MAX_TREE_SITTER_BYTES = 300_000

function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN)
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return `${filePath}:${startLine}-${endLine}`
}

function splitLargeChunk(chunk: CodeChunk): CodeChunk[] {
  if (chunk.tokenCount <= MAX_TOKENS) return [chunk]

  const lines = chunk.content.split('\n')
  const chunks: CodeChunk[] = []
  let startIdx = 0

  while (startIdx < lines.length) {
    const endIdx = Math.min(startIdx + CHUNK_LINES, lines.length)
    const subContent = lines.slice(startIdx, endIdx).join('\n')
    const startLine = chunk.startLine + startIdx
    const endLine = chunk.startLine + endIdx - 1

    chunks.push({
      id: makeChunkId(chunk.filePath, startLine, endLine),
      filePath: chunk.filePath,
      startLine,
      endLine,
      content: subContent,
      symbolName: chunk.symbolName,
      tokenCount: estimateTokens(subContent),
      language: chunk.language,
    })

    if (endIdx >= lines.length) break
    startIdx = endIdx - CHUNK_OVERLAP
  }

  return chunks
}

function chunkBySlidingWindow(content: string, filePath: string, language: string): CodeChunk[] {
  const lines = content.split('\n')
  if (lines.length === 0) return []

  if (lines.length <= CHUNK_LINES) {
    return [
      {
        id: makeChunkId(filePath, 1, lines.length),
        filePath,
        startLine: 1,
        endLine: lines.length,
        content,
        tokenCount: estimateTokens(content),
        language: language as CodeChunk['language'],
      },
    ]
  }

  const chunks: CodeChunk[] = []
  let startIdx = 0

  while (startIdx < lines.length) {
    const endIdx = Math.min(startIdx + CHUNK_LINES, lines.length)
    const chunkContent = lines.slice(startIdx, endIdx).join('\n')
    const startLine = startIdx + 1
    const endLine = endIdx

    chunks.push({
      id: makeChunkId(filePath, startLine, endLine),
      filePath,
      startLine,
      endLine,
      content: chunkContent,
      tokenCount: estimateTokens(chunkContent),
      language: language as CodeChunk['language'],
    })

    if (endIdx >= lines.length) break
    startIdx = endIdx - CHUNK_OVERLAP
  }

  return chunks
}

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

function chunkTsJs(content: string, filePath: string, language: string): CodeChunk[] {
  const lineCount = content.split('\n').length
  if (lineCount > MAX_TREE_SITTER_LINES) {
    return chunkBySlidingWindow(content, filePath, language)
  }

  const parser = language === 'typescript' ? tsParser : jsParser
  if (!parser) {
    return chunkBySlidingWindow(content, filePath, language)
  }

  try {
    const tree = parser.parse(content)
    const chunks: CodeChunk[] = []
    const lines = content.split('\n')

    // Collect line ranges covered by symbol chunks so we can fill gaps
    // (top-level imports, constants, statements) that tree-sitter would
    // otherwise drop entirely.
    const coveredRanges: Array<[number, number]> = []

    function walkNode(node: any): void {
      if (!node) return

      const type = node.type
      const shouldChunk =
        type === 'function_declaration' ||
        type === 'class_declaration' ||
        type === 'method_definition' ||
        type === 'arrow_function' ||
        type === 'function'

      if (shouldChunk && node.startPosition && node.endPosition) {
        const startLine = node.startPosition.row + 1
        const endLine = node.endPosition.row + 1
        coveredRanges.push([startLine, endLine])
        const chunkContent = lines.slice(startLine - 1, endLine).join('\n')
        let symbolName: string | undefined

        if (node.childCount > 0) {
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (
              child &&
              (child.type === 'identifier' ||
                child.type === 'property_identifier' ||
                child.type === 'type_identifier')
            ) {
              symbolName = child.text
              break
            }
          }
        }

        const chunk: CodeChunk = {
          id: makeChunkId(filePath, startLine, endLine),
          filePath,
          startLine,
          endLine,
          content: chunkContent,
          symbolName,
          tokenCount: estimateTokens(chunkContent),
          language: language as CodeChunk['language'],
        }

        chunks.push(...splitLargeChunk(chunk))
        return
      }

      for (let i = 0; i < node.childCount; i++) {
        walkNode(node.child(i))
      }
    }

    walkNode(tree.rootNode)

    if (chunks.length === 0) {
      return chunkBySlidingWindow(content, filePath, language)
    }

    // Fill gaps: top-level code not inside any chunked symbol. This captures
    // imports, exports, module-level constants, and standalone statements that
    // would otherwise be invisible to the agents.
    coveredRanges.sort((a, b) => a[0] - b[0])
    let cursor = 1
    const gaps: Array<[number, number]> = []
    for (const [s, e] of coveredRanges) {
      if (s > cursor) {
        gaps.push([cursor, s - 1])
      }
      cursor = Math.max(cursor, e + 1)
    }
    if (cursor <= lines.length) {
      gaps.push([cursor, lines.length])
    }

    for (const [gStart, gEnd] of gaps) {
      const gapContent = lines.slice(gStart - 1, gEnd).join('\n')
      if (gapContent.trim().length === 0) continue
      const gapChunk: CodeChunk = {
        id: makeChunkId(filePath, gStart, gEnd),
        filePath,
        startLine: gStart,
        endLine: gEnd,
        content: gapContent,
        tokenCount: estimateTokens(gapContent),
        language: language as CodeChunk['language'],
      }
      chunks.push(...splitLargeChunk(gapChunk))
    }

    // Sort by start line so chunks are in source order
    chunks.sort((a, b) => a.startLine - b.startLine)

    return chunks
  } catch {
    return chunkBySlidingWindow(content, filePath, language)
  }
}

function chunkPython(content: string, filePath: string): CodeChunk[] {
  if (content.split('\n').length > MAX_TREE_SITTER_LINES) {
    return chunkBySlidingWindow(content, filePath, 'python')
  }

  if (!pyParser) {
    return chunkBySlidingWindow(content, filePath, 'python')
  }

  try {
    const tree = pyParser.parse(content)
    const chunks: CodeChunk[] = []
    const lines = content.split('\n')
    const coveredRanges: Array<[number, number]> = []

    function walkNode(node: any): void {
      if (!node) return

      const type = node.type
      const shouldChunk = type === 'function_definition' || type === 'class_definition'

      if (shouldChunk && node.startPosition && node.endPosition) {
        const startLine = node.startPosition.row + 1
        const endLine = node.endPosition.row + 1
        coveredRanges.push([startLine, endLine])
        const chunkContent = lines.slice(startLine - 1, endLine).join('\n')
        let symbolName: string | undefined

        if (node.childCount > 0) {
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child && child.type === 'identifier') {
              symbolName = child.text
              break
            }
          }
        }

        const chunk: CodeChunk = {
          id: makeChunkId(filePath, startLine, endLine),
          filePath,
          startLine,
          endLine,
          content: chunkContent,
          symbolName,
          tokenCount: estimateTokens(chunkContent),
          language: 'python',
        }

        chunks.push(...splitLargeChunk(chunk))
        return
      }

      for (let i = 0; i < node.childCount; i++) {
        walkNode(node.child(i))
      }
    }

    walkNode(tree.rootNode)

    if (chunks.length === 0) {
      return chunkBySlidingWindow(content, filePath, 'python')
    }

    coveredRanges.sort((a, b) => a[0] - b[0])
    let cursor = 1
    const gaps: Array<[number, number]> = []
    for (const [s, e] of coveredRanges) {
      if (s > cursor) {
        gaps.push([cursor, s - 1])
      }
      cursor = Math.max(cursor, e + 1)
    }
    if (cursor <= lines.length) {
      gaps.push([cursor, lines.length])
    }

    for (const [gStart, gEnd] of gaps) {
      const gapContent = lines.slice(gStart - 1, gEnd).join('\n')
      if (gapContent.trim().length === 0) continue
      const gapChunk: CodeChunk = {
        id: makeChunkId(filePath, gStart, gEnd),
        filePath,
        startLine: gStart,
        endLine: gEnd,
        content: gapContent,
        tokenCount: estimateTokens(gapContent),
        language: 'python',
      }
      chunks.push(...splitLargeChunk(gapChunk))
    }

    chunks.sort((a, b) => a.startLine - b.startLine)

    return chunks
  } catch {
    return chunkBySlidingWindow(content, filePath, 'python')
  }
}

let treeSitterLoaded: boolean | null = null

export async function chunkFiles(
  manifests: FileManifest[],
  projectRoot?: string
): Promise<CodeChunk[]> {
  if (treeSitterLoaded === null) {
    const hasSmallFiles = manifests.some((m) => m.sizeBytes <= MAX_TREE_SITTER_BYTES)
    treeSitterLoaded = hasSmallFiles ? await loadTreeSitter() : false
  }

  const allChunks: CodeChunk[] = []

  for (const manifest of manifests) {
    let content: string
    try {
      content = await readFile(manifest.absolutePath, 'utf-8')
    } catch {
      continue
    }

    let chunks: CodeChunk[]

    switch (manifest.language) {
      case 'typescript':
      case 'javascript':
        chunks = chunkTsJs(content, manifest.path, manifest.language)
        break
      case 'python':
        chunks = chunkPython(content, manifest.path)
        break
      default:
        chunks = chunkBySlidingWindow(content, manifest.path, manifest.language)
    }

    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      chunks.length = MAX_CHUNKS_PER_FILE
    }

    if (projectRoot) {
      try {
        const deps = await traceDependencies(manifest.path, projectRoot, 1)
        if (deps.length > 0) {
          let depContext = '\n\n/* [DEPENDENCY CONTEXT] */\n'
          for (const dep of deps) {
            try {
              const depContent = await readFile(resolve(projectRoot, dep), 'utf-8')
              // Only inject first 150 lines of dependencies to save tokens
              const shortContent = depContent.split('\n').slice(0, 150).join('\n')
              depContext += `\n// --- ${dep} ---\n${shortContent}\n`
            } catch {
              continue
            }
          }
          // Prepend dependency context to the first chunk of the file
          if (chunks.length > 0) {
            chunks[0].content =
              depContext + '\n/* [END DEPENDENCY CONTEXT] */\n\n' + chunks[0].content
            chunks[0].tokenCount = estimateTokens(chunks[0].content)
          }
        }
      } catch (e) {
        // ignore dependency tracing errors
      }
    }

    allChunks.push(...chunks)
  }

  return allChunks
}
