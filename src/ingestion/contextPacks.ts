import { dirname, join, normalize } from 'node:path'
import type { CodeChunk } from './types.js'

const MAX_RESULTS = 4
const MAX_CHARS_PER_RESULT = 900

function toPosix(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\/+/, '')
}

function withoutExtension(path: string): string {
  return path.replace(/\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|cs|cpp|c|rb|php|swift|kt|dart)$/, '')
}

function resolveRelativeImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const resolved = normalize(join(dirname(fromFile), specifier))
  return toPosix(resolved)
}

function extractImportSpecifiers(content: string): string[] {
  const specs = new Set<string>()
  const importRegex = /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const regex of [importRegex, requireRegex]) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content))) {
      specs.add(match[1])
    }
  }

  return Array.from(specs)
}

function identifierTerms(content: string): Set<string> {
  const stop = new Set([
    'const',
    'export',
    'from',
    'function',
    'import',
    'interface',
    'return',
    'type',
  ])
  const terms = new Set<string>()
  for (const term of content.match(/\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g) ?? []) {
    const lower = term.toLowerCase()
    if (!stop.has(lower)) terms.add(lower)
  }
  return terms
}

function expectedTestBases(filePath: string): string[] {
  const base = withoutExtension(filePath)
  return [
    `${base}.test`,
    `${base}.spec`,
    `${base.replace(/\/src\//, '/test/')}.test`,
    `${base.replace(/\/src\//, '/tests/')}.test`,
  ].map(toPosix)
}

function scoreRelatedChunk(subject: CodeChunk, candidate: CodeChunk): number {
  if (candidate.id === subject.id) return 0

  const candidateBase = withoutExtension(toPosix(candidate.filePath))
  let score = 0

  for (const spec of extractImportSpecifiers(subject.content)) {
    const resolved = resolveRelativeImport(subject.filePath, spec)
    if (resolved && candidateBase === withoutExtension(resolved)) score += 10
  }

  for (const testBase of expectedTestBases(subject.filePath)) {
    if (candidateBase === testBase) score += 8
  }

  const subjectBase = withoutExtension(toPosix(subject.filePath)).split('/').pop()
  if (subjectBase && candidate.content.includes(subjectBase)) score += 4

  const subjectTerms = identifierTerms(subject.content)
  const candidateTerms = identifierTerms(candidate.content)
  let overlap = 0
  for (const term of subjectTerms) {
    if (candidateTerms.has(term)) overlap++
  }
  score += Math.min(overlap, 4)

  return score
}

export function buildRetrievedContext(subject: CodeChunk, allChunks: CodeChunk[]): string {
  const related = allChunks
    .map((chunk) => ({ chunk, score: scoreRelatedChunk(subject, chunk) }))
    .filter((entry) => entry.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)

  if (related.length === 0) return ''

  const blocks = related.map(({ chunk, score }) => {
    let content = chunk.content.slice(0, MAX_CHARS_PER_RESULT)
    if (content.length < chunk.content.length) content += '\n... (truncated)'
    return `// --- ${chunk.filePath} (score ${score}, lines ${chunk.startLine}-${chunk.endLine}) ---\n${content}`
  })

  return `\n\n/* [REPOSITORY CONTEXT] */\n${blocks.join('\n\n')}\n/* [END REPOSITORY CONTEXT] */\n\n`
}
