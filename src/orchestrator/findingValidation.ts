import crypto from 'node:crypto'
import type { AgentFinding } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/\\/g, '/')
}

function getMatchingChunkAndClamp(finding: AgentFinding, chunk: CodeChunk): AgentFinding | null {
  if (finding.lineStart === undefined) return finding
  if (!Number.isInteger(finding.lineStart)) return null
  if (finding.lineStart < chunk.startLine || finding.lineStart > chunk.endLine) return null

  const clamped = { ...finding }
  if (clamped.lineEnd !== undefined) {
    if (!Number.isInteger(clamped.lineEnd)) {
      clamped.lineEnd = undefined
    } else if (clamped.lineEnd < clamped.lineStart!) {
      clamped.lineEnd = clamped.lineStart
    } else if (clamped.lineEnd > chunk.endLine) {
      clamped.lineEnd = chunk.endLine
    }
  }
  return clamped
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
    if (!candidateChunks) {
      console.warn(`[validation] Finding references file not in reviewed chunks: ${normalizedPath}`)
      continue
    }

    let clampedFinding: AgentFinding | null = null
    let matchingChunk: CodeChunk | null = null
    for (const chunk of candidateChunks) {
      const match = getMatchingChunkAndClamp(finding, chunk)
      if (match) {
        clampedFinding = match
        matchingChunk = chunk
        break
      }
    }

    if (!clampedFinding || !matchingChunk) {
      console.warn(
        `[validation] Finding at ${normalizedPath}:${finding.lineStart}-${finding.lineEnd} falls outside all known chunks — dropping`
      )
      continue
    }

    const normalized: AgentFinding = {
      ...clampedFinding,
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
