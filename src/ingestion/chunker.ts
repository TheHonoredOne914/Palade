import { readFile } from 'node:fs/promises'
import type { FileManifest, CodeChunk } from './types.js'

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

export async function chunkFiles(manifests: FileManifest[]): Promise<CodeChunk[]> {
  const allChunks: CodeChunk[] = []

  for (const manifest of manifests) {
    let content: string
    try {
      content = await readFile(manifest.absolutePath, 'utf-8')
    } catch {
      continue
    }

    const chunks = chunkBySlidingWindow(content, manifest.path, manifest.language)

    if (chunks.length > MAX_CHUNKS_PER_FILE) {
      chunks.length = MAX_CHUNKS_PER_FILE
    }

    allChunks.push(...chunks)
  }

  return allChunks
}
