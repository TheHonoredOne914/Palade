import { readFile } from 'node:fs/promises'
import type { FileManifest, CodeChunk } from './types.js'

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
      language: chunk.language
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
    return [{
      id: makeChunkId(filePath, 1, lines.length),
      filePath,
      startLine: 1,
      endLine: lines.length,
      content,
      tokenCount: estimateTokens(content),
      language: language as CodeChunk['language']
    }]
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
      language: language as CodeChunk['language']
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

    function walkNode(node: any): void {
      if (!node) return

      const type = node.type
      const shouldChunk =
        type === 'function_declaration' ||
        type === 'class_declaration' ||
        type === 'method_definition'

      if (shouldChunk && node.startPosition && node.endPosition) {
        const startLine = node.startPosition.row + 1
        const endLine = node.endPosition.row + 1
        const chunkContent = lines.slice(startLine - 1, endLine).join('\n')
        let symbolName: string | undefined

        if (node.childCount > 0) {
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i)
            if (child && (child.type === 'identifier' || child.type === 'property_identifier' || child.type === 'type_identifier')) {
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
          language: language as CodeChunk['language']
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

    function walkNode(node: any): void {
      if (!node) return

      const type = node.type
      const shouldChunk =
        type === 'function_definition' ||
        type === 'class_definition'

      if (shouldChunk && node.startPosition && node.endPosition) {
        const startLine = node.startPosition.row + 1
        const endLine = node.endPosition.row + 1
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
          language: 'python'
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

    return chunks
  } catch {
    return chunkBySlidingWindow(content, filePath, 'python')
  }
}

let treeSitterLoaded = false

export async function chunkFiles(manifests: FileManifest[]): Promise<CodeChunk[]> {
  if (!treeSitterLoaded) {
    const hasSmallFiles = manifests.some(m => m.sizeBytes <= MAX_TREE_SITTER_BYTES)
    if (hasSmallFiles) {
      treeSitterLoaded = await loadTreeSitter()
    }
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

    allChunks.push(...chunks)

    if (allChunks.length > MAX_CHUNKS_PER_FILE * manifests.length) {
      break
    }
  }

  if (allChunks.length > MAX_CHUNKS_PER_FILE * manifests.length) {
    allChunks.length = MAX_CHUNKS_PER_FILE * manifests.length
  }

  return allChunks
}
