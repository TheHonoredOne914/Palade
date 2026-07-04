import type { CodeChunk } from './types.js'

export function buildKeywordIndex(chunks: CodeChunk[]): CodeChunk[] {
  // Snapshot each chunk before returning. Callers (e.g. the keyword-context
  // injection loop in orchestrator/pipeline.ts) mutate `chunk.content` in
  // place on the chunks used as the review corpus; if this index shared the
  // same objects, chunks processed later in that loop would end up matching
  // against already-inflated content from earlier iterations. Copying here
  // decouples the index from those later mutations.
  return chunks.map((chunk) => ({ ...chunk }))
}

export function getKeywordContext(
  chunk: CodeChunk,
  index: CodeChunk[],
  maxResults = 3,
  maxTokensPerResult = 250
): string {
  if (!chunk.symbolName) return ''

  const searchString = `${chunk.symbolName || ''} ${chunk.content.substring(0, 200)}`.toLowerCase()
  // Extract words longer than 3 characters to use as search terms
  let searchTerms = Array.from(new Set(searchString.match(/\b[a-z]{4,}\b/g) || []))

  const stopWords = new Set([
    'export',
    'import',
    'return',
    'const',
    'function',
    'class',
    'interface',
    'type',
    'async',
    'await',
  ])
  searchTerms = searchTerms.filter((t) => !stopWords.has(t))

  if (searchTerms.length === 0) return ''

  const scoredChunks = index
    .filter((c) => c.id !== chunk.id)
    .map((c) => {
      const contentLower = c.content.toLowerCase()
      // Extract words from chunk content
      const chunkWords = contentLower.match(/\b[a-z]{4,}\b/g) || []
      const chunkWordCount = chunkWords.length

      let queryWordCount = 0

      // Calculate how many times each search term appears as a distinct word
      for (const term of searchTerms) {
        // Use a simple word frequency count instead of includes
        let termMatches = 0
        for (const w of chunkWords) {
          if (w === term) termMatches++
        }
        queryWordCount += termMatches
      }

      // Term-frequency score
      const score = queryWordCount / (chunkWordCount + 1)
      return { chunk: c, score }
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scoredChunks.length === 0) return ''

  const topResults = scoredChunks.slice(0, maxResults)
  let depContext = '\n\n/* [REPOSITORY CONTEXT (KEYWORD)] */\n'

  for (const res of topResults) {
    const fullContent = res.chunk.content
    const maxChars = maxTokensPerResult * 4
    let shortContent = fullContent.substring(0, maxChars)
    if (shortContent.length < fullContent.length) {
      shortContent += '\n... (truncated)'
    }
    depContext += `\n// --- ${res.chunk.filePath} ${res.chunk.symbolName ? `(${res.chunk.symbolName})` : ''} ---\n${shortContent}\n`
  }

  depContext += '\n/* [END REPOSITORY CONTEXT] */\n\n'
  return depContext
}
