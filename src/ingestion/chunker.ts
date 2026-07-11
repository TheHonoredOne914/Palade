import { readFile } from 'node:fs/promises'
import type { FileManifest, CodeChunk, Language } from './types.js'
import ts from 'typescript'
import pLimit from 'p-limit'

export const MAX_TOKENS = 6000
const CHUNK_LINES = 150
const CHUNK_OVERLAP = 30
export const CHARS_PER_TOKEN = 4
const MAX_TREE_SITTER_LINES = 3000
const MAX_CHUNKS_PER_FILE = 50
const MAX_TREE_SITTER_BYTES = 300_000

export function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN)
}

function makeChunkId(filePath: string, startLine: number, endLine: number): string {
  return `${filePath}:${startLine}-${endLine}`
}

export function splitLargeChunk(
  chunk: CodeChunk,
  hardChunkLimit: number = MAX_TOKENS
): CodeChunk[] {
  if (chunk.tokenCount <= hardChunkLimit) return [chunk]

  const lines = chunk.content.split('\n')
  const chunks: CodeChunk[] = []
  let startIdx = 0

  while (startIdx < lines.length) {
    // Attach the parent's injected context only to the first sub-chunk so the
    // agent still sees it; repeating it on every sub-chunk would blow the token
    // limit that triggered the split in the first place.
    const isFirst = chunks.length === 0
    const contextPrefix = isFirst ? chunk.contextPrefix : undefined
    const prefixChars = contextPrefix ? contextPrefix.length : 0

    let endIdx = Math.min(startIdx + CHUNK_LINES, lines.length)
    if (prefixChars > 0) {
      // Shrink the first sub-chunk so prefix + content stays within hardChunkLimit.
      const maxContentChars = hardChunkLimit * CHARS_PER_TOKEN - prefixChars
      let charCount = 0
      let adjustedEnd = startIdx
      for (let i = startIdx; i < endIdx; i++) {
        charCount += lines[i].length + 1
        if (charCount > maxContentChars) break
        adjustedEnd = i + 1
      }
      endIdx = Math.max(startIdx + 1, adjustedEnd)
    }

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
      tokenCount: contextPrefix
        ? estimateTokens(contextPrefix + subContent)
        : estimateTokens(subContent),
      language: chunk.language,
      // Preserve the parent chunk's complexity so sub-chunks split off from
      // a complex function keep its complexity-based scoring multiplier
      // instead of losing it once split.
      complexity: chunk.complexity,
      contextPrefix,
    })

    if (endIdx >= lines.length) break
    // Clamp forward progress the same way chunkByBrackets does: a large
    // contextPrefix on the first sub-chunk can shrink endIdx down to just
    // startIdx+1, and endIdx - CHUNK_OVERLAP from there would go negative —
    // slicing from the wrong end of `lines` and emitting a negative
    // startLine. Fall back to endIdx itself when the overlap step wouldn't
    // move forward.
    const nextStart = endIdx - CHUNK_OVERLAP
    startIdx = nextStart > startIdx ? nextStart : endIdx
  }

  return chunks
}

function isComplexityNode(n: ts.Node): boolean {
  return (
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
  )
}

function calculateComplexity(node: ts.Node): number {
  let complexity = 1
  ts.forEachChild(node, function visit(n) {
    if (isComplexityNode(n)) complexity++
    ts.forEachChild(n, visit)
  })
  return complexity
}

// Same traversal as calculateComplexity, but over a list of already-parsed
// top-level nodes instead of re-parsing their concatenated text into a
// synthetic source file. A chunk spans one or more top-level nodes from the
// ORIGINAL sourceFile; treating each of them the way calculateComplexity
// treats a direct child of its root (checked, then recursed into) reproduces
// the exact same count without a second full parse per chunk.
function calculateComplexityForNodes(nodes: ts.Node[]): number {
  let complexity = 1
  const visit = (n: ts.Node) => {
    if (isComplexityNode(n)) complexity++
    ts.forEachChild(n, visit)
  }
  for (const node of nodes) visit(node)
  return complexity
}

// Derive a human-readable name for a top-level node, mirroring the
// declaration matching in symbolResolver.ts's visit() so chunks carry the
// same symbolName keywordIndex.ts's getKeywordContext() expects.
function getTopLevelSymbolName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text
  }
  if (ts.isVariableStatement(node)) {
    const decl = node.declarationList.declarations[0]
    if (decl && ts.isIdentifier(decl.name)) return decl.name.text
  }
  return undefined
}

function chunkByAST(content: string, filePath: string, language: Language): CodeChunk[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const chunks: CodeChunk[] = []
  let currentStartNode: ts.Node | null = null
  let currentEndNode: ts.Node | null = null
  let currentNodes: ts.Node[] = []
  let currentTokenCount = 0

  const finishChunk = () => {
    if (!currentStartNode || !currentEndNode) return
    const start = sourceFile.getLineAndCharacterOfPosition(currentStartNode.getStart())
    const end = sourceFile.getLineAndCharacterOfPosition(currentEndNode.getEnd())
    const chunkContent = content.substring(currentStartNode.getStart(), currentEndNode.getEnd())
    const symbolName = getTopLevelSymbolName(currentStartNode)
    const complexity = calculateComplexityForNodes(currentNodes)

    chunks.push({
      id: makeChunkId(filePath, start.line + 1, end.line + 1),
      filePath,
      startLine: start.line + 1,
      endLine: end.line + 1,
      content: chunkContent,
      symbolName,
      tokenCount: estimateTokens(chunkContent),
      language,
      complexity,
    })

    currentStartNode = null
    currentEndNode = null
    currentNodes = []
    currentTokenCount = 0
  }

  ts.forEachChild(sourceFile, (node) => {
    const nodeTokens = estimateTokens(node.getText(sourceFile))

    // Flush thresholds match MAX_TOKENS (the actual per-chunk cap downstream)
    // instead of a stale lower constant — the old 2000/3000 values predated
    // MAX_TOKENS being raised to 6000 and were silently doubling chunk count
    // (and every downstream batch/provider call) on TypeScript-heavy codebases.
    if (nodeTokens > MAX_TOKENS) {
      finishChunk()
      currentStartNode = node
      currentEndNode = node
      currentNodes = [node]
      finishChunk()
      return
    }

    if (currentTokenCount + nodeTokens > MAX_TOKENS) {
      finishChunk()
    }

    if (!currentStartNode) currentStartNode = node
    currentEndNode = node
    currentNodes.push(node)
    currentTokenCount += nodeTokens
  })

  finishChunk()

  return chunks.flatMap(splitLargeChunk)
}

// Keywords after which a '/' is unambiguously a regex start even though the
// preceding significant character is a letter (e.g. `return /foo/`,
// `typeof /foo/`, `case /foo/:`) — without tracking the actual word, these
// were misread as division, and a brace inside that misread "division"
// corrupted bracket-depth chunk boundaries.
const REGEX_ALLOWED_AFTER_KEYWORDS = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'delete',
  'void',
  'throw',
  'instanceof',
  'new',
  'yield',
  'await',
])

// A leading '/' starts a regex literal unless it more plausibly means
// division/comment-adjacent — i.e. unless the previous significant
// character is an identifier/number char (and that identifier isn't one of
// the keywords above), or a closing ')'/']', or the end of a string literal.
// This is a simple heuristic (matches the pattern the audit fix sketch
// asked for), not a full JS grammar.
function isRegexStartAllowed(lastSignificantChar: string, lastWord: string): boolean {
  if (!lastSignificantChar) return true
  if (/[A-Za-z0-9_$]/.test(lastSignificantChar)) {
    return REGEX_ALLOWED_AFTER_KEYWORDS.has(lastWord)
  }
  if (
    lastSignificantChar === ')' ||
    lastSignificantChar === ']' ||
    lastSignificantChar === '"' ||
    lastSignificantChar === "'" ||
    lastSignificantChar === '`'
  ) {
    return false
  }
  return true
}

function chunkByBrackets(content: string, filePath: string, language: string): CodeChunk[] {
  const lines = content.split('\n')
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) return []

  const chunks: CodeChunk[] = []
  let startIdx = 0

  while (startIdx < lines.length) {
    let depth = 0
    let currentIdx = startIdx
    const maxLines = 300

    // Scanner state, persists across lines within this chunk scan
    let inString: '"' | "'" | '`' | null = null
    let inBlockComment = false
    let inRegex = false
    let inRegexCharClass = false
    let lastSignificantChar = ''
    // Last run of identifier characters seen (e.g. "return", "typeof") — used
    // alongside lastSignificantChar so isRegexStartAllowed can special-case
    // regex-allowed keywords instead of treating any preceding letter as
    // division.
    let lastWord = ''
    let wordBuffer = ''
    // Whether any '{' has been seen in this chunk. Brace-less languages
    // (Python, Ruby, etc.) never increment depth above 0, so without this the
    // depth<=0 break below fires after every 5 lines — shredding the whole
    // file into ~5-line chunks that then blow past MAX_CHUNKS_PER_FILE and
    // silently truncate the file's tail. Require a full CHUNK_LINES-sized
    // chunk before breaking when we've never seen a brace, matching the size
    // of the line-based fallback; brace-heavy languages keep the original
    // 5-line minimum.
    let sawBrace = false

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
          if (ch === inString) {
            inString = null
            lastSignificantChar = ch
          }
          continue
        }

        if (inRegex) {
          if (ch === '\\') {
            i++
            continue
          } // skip escaped char
          if (ch === '[') inRegexCharClass = true
          else if (ch === ']') inRegexCharClass = false
          else if (ch === '/' && !inRegexCharClass) {
            inRegex = false
            lastSignificantChar = ch
          }
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
        if (ch === '/' && isRegexStartAllowed(lastSignificantChar, lastWord)) {
          inRegex = true
          continue
        }

        if (ch === '{') {
          depth++
          sawBrace = true
        } else if (ch === '}') depth--

        if (/[A-Za-z0-9_$]/.test(ch)) {
          wordBuffer += ch
        } else if (wordBuffer) {
          lastWord = wordBuffer
          wordBuffer = ''
        }

        if (!/\s/.test(ch)) lastSignificantChar = ch
      }

      currentIdx++
      // If we've closed all blocks, have at least some lines, and aren't mid-string/comment, end chunk here
      const minLines = sawBrace ? 5 : CHUNK_LINES
      if (
        depth <= 0 &&
        currentIdx - startIdx >= minLines &&
        !inString &&
        !inBlockComment &&
        !inRegex
      ) {
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

    const nextStart = endIdx - CHUNK_OVERLAP
    startIdx = nextStart > startIdx ? nextStart : endIdx
  }

  return chunks
}

const MAX_CONCURRENT_FILE_READS = 16

async function chunkOneFile(manifest: FileManifest): Promise<CodeChunk[]> {
  let content: string
  try {
    content = await readFile(manifest.absolutePath, 'utf-8')
    if (content.includes('�')) {
      console.warn(
        `[chunker] Warning: File ${manifest.path} contains invalid UTF-8 characters and may degrade analysis.`
      )
    }
  } catch (err) {
    console.warn(
      `[chunker] Failed to read ${manifest.path}: ${err instanceof Error ? err.message : String(err)}`
    )
    return []
  }

  const isAstLanguage = manifest.language === 'typescript' || manifest.language === 'javascript'
  // Guard against handing huge files to the AST parser: a pathologically
  // large file can make full-program parsing slow/memory-heavy. Fall back
  // to the cheaper line/bracket-based chunking strategy above these caps.
  const lineCount = content.length === 0 ? 0 : content.split('\n').length
  const byteSize = Buffer.byteLength(content, 'utf-8')
  const exceedsParseLimits = lineCount > MAX_TREE_SITTER_LINES || byteSize > MAX_TREE_SITTER_BYTES

  let chunks: CodeChunk[]
  if (isAstLanguage && !exceedsParseLimits) {
    try {
      chunks = chunkByAST(content, manifest.path, manifest.language)
    } catch (err) {
      // chunkByAST is documented to fall back to line-based chunking on parse
      // failure, but that fallback only actually happens if we catch here —
      // an uncaught throw would reject this file's entry in the chunkFiles()
      // Promise.all and crash the whole pipeline instead.
      console.warn(
        `[chunker] AST parsing failed for ${manifest.path} (${err instanceof Error ? err.message : String(err)}) — falling back to line-based chunking.`
      )
      chunks = chunkByBrackets(content, manifest.path, manifest.language).flatMap(splitLargeChunk)
    }
  } else {
    if (isAstLanguage && exceedsParseLimits) {
      console.warn(
        `[chunker] File ${manifest.path} (${lineCount} lines, ${byteSize} bytes) exceeds the ` +
          `AST parsing size guard (${MAX_TREE_SITTER_LINES} lines / ${MAX_TREE_SITTER_BYTES} bytes) — ` +
          `falling back to line-based chunking.`
      )
    }
    // chunkByBrackets caps blocks at 300 lines, but very long lines can still
    // push a chunk past MAX_TOKENS — enforce the token cap explicitly.
    chunks = chunkByBrackets(content, manifest.path, manifest.language).flatMap(splitLargeChunk)
  }

  if (chunks.length > MAX_CHUNKS_PER_FILE) {
    const droppedCount = chunks.length - MAX_CHUNKS_PER_FILE
    // Use console.error (not warn) so this is unmissable: a file this large
    // silently loses review coverage on its tail, which is easy to miss in
    // noisy logs otherwise.
    console.error(
      `[chunker] TRUNCATED: ${manifest.path} produced ${chunks.length} chunks, exceeding the ` +
        `${MAX_CHUNKS_PER_FILE}-chunk cap (kept ${MAX_CHUNKS_PER_FILE}, dropped ${droppedCount}) — ` +
        `the last ${droppedCount} chunk(s) of this file were NOT reviewed.`
    )
    chunks.length = MAX_CHUNKS_PER_FILE
    // Mark the final surviving chunk so callers can programmatically detect
    // truncation (not just via log output).
    const lastChunk = chunks[chunks.length - 1]
    if (lastChunk) lastChunk.truncated = true
  }

  return chunks
}

export async function chunkFiles(manifests: FileManifest[]): Promise<CodeChunk[]> {
  // Files were previously read and chunked one at a time (await inside a
  // for-of loop), fully serializing disk I/O across the whole project. A
  // bounded-concurrency map keeps output order stable (Promise.all resolves
  // in input order regardless of completion order) while letting multiple
  // file reads/parses overlap.
  const limit = pLimit(MAX_CONCURRENT_FILE_READS)
  const perFileChunks = await Promise.all(
    manifests.map((manifest) => limit(() => chunkOneFile(manifest)))
  )
  return perFileChunks.flat()
}
