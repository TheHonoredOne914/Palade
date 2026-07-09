import type { CodeChunk } from '../ingestion/types.js'
import { estimateTokens, MAX_TOKENS } from '../ingestion/chunker.js'

export function makeMinifiedChunk(): CodeChunk {
  const chars = MAX_TOKENS * 4 + 11
  const content = 'const x="' + 'a'.repeat(chars - 11) + '";'
  return {
    id: 'minified.ts',
    filePath: 'minified.ts',
    startLine: 1,
    endLine: 1,
    content,
    tokenCount: estimateTokens(content),
    language: 'typescript',
  }
}

export function makeNormalChunk(lineCount = 800, lineLength = 40): CodeChunk {
  const body = Array.from(
    { length: lineCount },
    (_, i) => `function f${i}() { return '${'x'.repeat(Math.max(0, lineLength - 18))}' }`
  ).join('\n')
  return {
    id: 'normal.ts',
    filePath: 'normal.ts',
    startLine: 1,
    endLine: lineCount,
    content: body,
    tokenCount: estimateTokens(body),
    language: 'typescript',
  }
}

export function makeMixedChunk(): CodeChunk {
  const normal = Array.from(
    { length: 200 },
    (_, i) => `export function g${i}() { return ${i} }`
  ).join('\n')
  const chars = MAX_TOKENS * 4 + 11
  const minified = 'const m="' + 'a'.repeat(chars - 11) + '";'
  return {
    id: 'mixed.ts',
    filePath: 'mixed.ts',
    startLine: 1,
    endLine: 201,
    content: `${normal}\n${minified}`,
    tokenCount: estimateTokens(`${normal}\n${minified}`),
    language: 'typescript',
  }
}

export function makeHugeSingleLineChunk(): CodeChunk {
  const chars = Math.ceil(MAX_TOKENS * 4 * Math.pow(2, 11)) + 11
  const content = 'const x="' + 'a'.repeat(chars - 11) + '";'
  return {
    id: 'huge.ts',
    filePath: 'huge.ts',
    startLine: 1,
    endLine: 1,
    content,
    tokenCount: estimateTokens(content),
    language: 'typescript',
  }
}

export function makeWindowsPathChunk(): CodeChunk {
  return {
    id: 'C:\\path\\to\\file.ts',
    filePath: 'C:\\path\\to\\file.ts',
    startLine: 1,
    endLine: 50,
    content: 'export const y = 1',
    tokenCount: 10,
    language: 'typescript',
  }
}

export function makeRelativePathChunk(): CodeChunk {
  return {
    id: 'src/foo.ts',
    filePath: 'src/foo.ts',
    startLine: 1,
    endLine: 300,
    content: 'export const z = 1',
    tokenCount: 10,
    language: 'typescript',
  }
}
