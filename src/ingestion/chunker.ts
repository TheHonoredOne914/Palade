import { readFile } from 'node:fs/promises'
import type { FileManifest, CodeChunk } from './types.js'
import ts from 'typescript'

const MAX_TOKENS = 6000
const CHUNK_LINES = 150
const CHUNK_OVERLAP = 30
const CHARS_PER_TOKEN = 4
const MAX_TREE_SITTER_LINES = 3000
const MAX_CHUNKS_PER_FILE = 50
const MAX_TREE_SITTER_BYTES = 300_000

export function estimateTokens(content: string): number {
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

function calculateComplexity(node: ts.Node): number {
  let complexity = 1
  ts.forEachChild(node, function visit(n) {
    if (
      ts.isIfStatement(n) ||
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n) ||
      ts.isCaseClause(n) ||
      ts.isCatchClause(n) ||
      ts.isConditionalExpression(n) ||
      (ts.isBinaryExpression(n) &&
        (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
          n.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
          n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken))
    ) {
      complexity++
    }
    ts.forEachChild(n, visit)
  })
  return complexity
}

function chunkByAST(content: string, filePath: string, language: string): CodeChunk[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const chunks: CodeChunk[] = []
  let currentStartNode: ts.Node | null = null
  let currentEndNode: ts.Node | null = null
  let currentTokenCount = 0

  const finishChunk = () => {
    if (!currentStartNode || !currentEndNode) return
    const start = sourceFile.getLineAndCharacterOfPosition(currentStartNode.getStart())
    const end = sourceFile.getLineAndCharacterOfPosition(currentEndNode.getEnd())
    const chunkContent = content.substring(currentStartNode.getStart(), currentEndNode.getEnd())

    const tempFile = ts.createSourceFile('temp.ts', chunkContent, ts.ScriptTarget.Latest, true)
    const complexity = calculateComplexity(tempFile)

    chunks.push({
      id: makeChunkId(filePath, start.line + 1, end.line + 1),
      filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      content: chunkContent,
      tokenCount: estimateTokens(chunkContent),
      language: language as any,
      complexity,
    })

    currentStartNode = null
    currentEndNode = null
    currentTokenCount = 0
  }

  ts.forEachChild(sourceFile, (node) => {
    const nodeTokens = estimateTokens(node.getText(sourceFile))

    if (nodeTokens > 2000) {
      finishChunk()
      currentStartNode = node
      currentEndNode = node
      finishChunk()
      return
    }

    if (currentTokenCount + nodeTokens > 3000) {
      finishChunk()
    }

    if (!currentStartNode) currentStartNode = node
    currentEndNode = node
    currentTokenCount += nodeTokens
  })

  finishChunk()

  return chunks.flatMap(splitLargeChunk)
}

function chunkByBrackets(content: string, filePath: string, language: string): CodeChunk[] {
  const lines = content.split('\n')
  if (lines.length === 0) return []

  const chunks: CodeChunk[] = []
  let startIdx = 0

  while (startIdx < lines.length) {
    let depth = 0
    let currentIdx = startIdx
    const maxLines = 300

    // Scanner state, persists across lines within this chunk scan
    let inString: '"' | "'" | '`' | null = null
    let inBlockComment = false

    while (currentIdx < lines.length && currentIdx - startIdx < maxLines) {
      const line = lines[currentIdx]
      let inLineComment = false

      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        const next = line[i + 1]

        if (inLineComment) continue

        if (inBlockComment) {
          if (ch === '*' && next === '/') {
            inBlockComment = false
            i++
          }
          continue
        }

        if (inString) {
          if (ch === '\\') {
            i++
            continue
          } // skip escaped char
          if (ch === inString) inString = null
          continue
        }

        if (ch === '/' && next === '/') {
          inLineComment = true
          continue
        }
        if (ch === '/' && next === '*') {
          inBlockComment = true
          i++
          continue
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = ch
          continue
        }

        if (ch === '{') depth++
        else if (ch === '}') depth--
      }

      currentIdx++
      // If we've closed all blocks, have at least some lines, and aren't mid-string/comment, end chunk here
      if (depth <= 0 && currentIdx - startIdx >= 5 && !inString && !inBlockComment) {
        break
      }
    }

    // If we scanned through maxLines but depth > 0, we just slice here
    const endIdx = currentIdx

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

    startIdx = endIdx
  }

  return chunks
}

export async function chunkFiles(manifests: FileManifest[]): Promise<CodeChunk[]> {
  const allChunks: CodeChunk[] = []

  for (const manifest of manifests) {
    let content: string
    try {
      content = await readFile(manifest.absolutePath, 'utf-8')
      if (content.includes('\uFFFD')) {
        console.warn(
          `[chunker] Warning: File ${manifest.path} contains invalid UTF-8 characters and may degrade analysis.`
        )
      }
    } catch (err) {
      console.warn(
        `[chunker] Failed to read ${manifest.path}: ${err instanceof Error ? err.message : String(err)}`
      )
      continue
    }

    let chunks: CodeChunk[]
    if (manifest.language === 'typescript' || manifest.language === 'javascript') {
      chunks = chunkByAST(content, manifest.path, manifest.language)
    } else {
      // chunkByBrackets caps blocks at 300 lines, but very long lines can still
      // push a chunk past MAX_TOKENS — enforce the token cap explicitly.
      chunks = chunkByBrackets(content, manifest.path, manifest.language).flatMap(splitLargeChunk)
    }

    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      chunks.length = MAX_CHUNKS_PER_FILE
    }

    allChunks.push(...chunks)
  }

  return allChunks
}
