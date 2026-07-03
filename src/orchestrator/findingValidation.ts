import crypto from 'node:crypto'
import type { AgentFinding } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/\\/g, '/')
}

function lineIsInsideChunk(finding: AgentFinding, chunk: CodeChunk): boolean {
  if (finding.lineStart === undefined) return true
  if (!Number.isInteger(finding.lineStart)) return false
  if (finding.lineStart < chunk.startLine || finding.lineStart > chunk.endLine) return false
  if (finding.lineEnd !== undefined) {
    if (!Number.isInteger(finding.lineEnd)) return false
    if (finding.lineEnd < finding.lineStart) return false
    if (finding.lineEnd > chunk.endLine) return false
  }
  return true
}

function fingerprintFor(finding: AgentFinding): string {
  const file = finding.filePath ? normalizePath(finding.filePath) : 'global'
  const symbol = finding.symbolName?.trim() || 'file'
  const lineBucket =
    typeof finding.lineStart === 'number' && Number.isInteger(finding.lineStart)
      ? String(finding.lineStart)
      : 'file'
  const tagKey = [...new Set((finding.tags ?? []).filter((t) => typeof t === 'string'))]
    .sort()
    .slice(0, 3)
    .join(',')
  const basis = `${finding.agentName}:${finding.severity}:${file}:${symbol}:${lineBucket}:${tagKey}`
  const digest = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12)
  return `${finding.agentName}:${finding.severity}:${file}:${symbol}:${digest}`
}

export function validateAndFingerprintFindings(
  findings: AgentFinding[],
  chunks: CodeChunk[]
): AgentFinding[] {
  const chunksByPath = new Map<string, CodeChunk[]>()
  for (const chunk of chunks) {
    const key = normalizePath(chunk.filePath)
    const list = chunksByPath.get(key) ?? []
    list.push(chunk)
    chunksByPath.set(key, list)
  }

  const validated: AgentFinding[] = []
  for (const finding of findings) {
    const tags = Array.isArray(finding.tags)
      ? finding.tags.filter((tag): tag is string => typeof tag === 'string')
      : []

    if (!finding.filePath) {
      validated.push({
        ...finding,
        tags,
        findingFingerprint: fingerprintFor({ ...finding, tags }),
      })
      continue
    }

    const normalizedPath = normalizePath(finding.filePath)
    const candidateChunks = chunksByPath.get(normalizedPath)
    if (!candidateChunks) continue

    const matchingChunk = candidateChunks.find((chunk) => lineIsInsideChunk(finding, chunk))
    if (!matchingChunk) continue

    const normalized: AgentFinding = {
      ...finding,
      filePath: normalizedPath,
      tags,
      symbolName: finding.symbolName || matchingChunk.symbolName,
    }
    validated.push({
      ...normalized,
      findingFingerprint: fingerprintFor(normalized),
    })
  }

  return validated
}
