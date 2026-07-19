import type { CodeChunk } from './types.js'
import { CODE_STOP_WORDS } from './stopWords.js'

type IndexedChunk = CodeChunk & { _words: string[] }

export function buildKeywordIndex(chunks: CodeChunk[]): IndexedChunk[] {
  // Snapshot each chunk before returning. Callers (e.g. the keyword-context
  // injection loop in orchestrator/pipeline.ts) mutate `chunk.content` in
  // place on the chunks used as the review corpus; if this index shared the
  // same objects, chunks processed later in that loop would end up matching
  // against already-inflated content from earlier iterations. Copying here
  // decouples the index from those later mutations.
  //
  // Also pre-compute word lists once per chunk so getKeywordContext doesn't
  // re-extract them on every call — this avoids O(N*M) redundant regex work
  // where N = chunks reviewed and M = chunks in the index.
  return chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase()
    const words = contentLower.match(/\b[a-z]{4,}\b/g) ?? []
    return { ...chunk, _words: words }
  })
}

export function getKeywordContext(
  chunk: CodeChunk,
  index: IndexedChunk[],
  maxResults = 3,
  maxTokensPerResult = 250
): string {
  // Fallback chunks (chunkByBrackets on non-TS/JS or oversized files) never
  // get a symbolName — bailing out here meant those chunks got zero keyword
  // context. Fall back to sampling the chunk's own content/filename as the
  // search basis instead of requiring a symbolName (ingest-001); the
  // searchTerms.length===0 check below still short-circuits genuinely empty
  // chunks the same way the old guard did.
  if (!chunk.symbolName && !chunk.content) return ''

  const searchString =
    `${chunk.symbolName || chunk.filePath} ${chunk.content.substring(0, 200)}`.toLowerCase()
  // Extract words longer than 3 characters to use as search terms
  let searchTerms = Array.from(new Set(searchString.match(/\b[a-z]{4,}\b/g) || []))

  searchTerms = searchTerms.filter((t) => !CODE_STOP_WORDS.has(t))

  if (searchTerms.length === 0) return ''

  const scoredChunks = index
    .filter((c) => c.id !== chunk.id)
    .map((c) => {
      const chunkWords = c._words
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
    const label = res.chunk.symbolName
      ? `lines ${res.chunk.startLine}-${res.chunk.endLine}, ${res.chunk.symbolName}`
      : `lines ${res.chunk.startLine}-${res.chunk.endLine}`
    depContext += `\n// --- ${res.chunk.filePath} (${label}) ---\n${shortContent}\n`
  }

  depContext += '\n/* [END REPOSITORY CONTEXT] */\n\n'
  return depContext
}
