import MiniSearch from 'minisearch'
import type { CodeChunk } from './types.js'
import { estimateTokens } from './chunker.js'

export function buildRagIndex(chunks: CodeChunk[]): MiniSearch {
  const miniSearch = new MiniSearch({
    fields: ['content', 'symbolName', 'filePath'],
    storeFields: ['content', 'symbolName', 'filePath'],
    idField: 'id',
    searchOptions: {
      boost: { symbolName: 3, filePath: 2, content: 1 },
      combineWith: 'OR',
    },
  })

  miniSearch.addAll(
    chunks.map((c) => ({
      id: c.id,
      content: c.content,
      symbolName: c.symbolName ?? '',
      filePath: c.filePath,
    }))
  )

  return miniSearch
}

export function getRagContext(
  chunk: CodeChunk,
  index: MiniSearch,
  maxResults = 3,
  maxTokensPerResult = 250
): string {
  // Use chunk's own content and symbol as query terms
  const query = (chunk.symbolName || '') + ' ' + chunk.content.substring(0, 500)

  const results = index.search(query, {
    filter: (result) => result.id !== chunk.id && result.score > 3, // Require a minimum score to avoid noise
  })

  if (results.length === 0) return ''

  const topResults = results.slice(0, maxResults)
  let depContext = '\n\n/* [REPOSITORY CONTEXT (RAG)] */\n'

  for (const res of topResults) {
    const fullContent = res.content as string
    // Trim to avoid blowing up the prompt context
    const lines = fullContent.split('\n')
    // We want to approximate maxTokensPerResult. A line is ~10 tokens on average,
    // but we can just use string slicing for safety.
    const maxChars = maxTokensPerResult * 4
    let shortContent = fullContent.substring(0, maxChars)
    if (shortContent.length < fullContent.length) {
      shortContent += '\n... (truncated)'
    }
    depContext += `\n// --- ${res.filePath} ${res.symbolName ? `(${res.symbolName})` : ''} ---\n${shortContent}\n`
  }

  depContext += '\n/* [END REPOSITORY CONTEXT] */\n\n'
  return depContext
}
