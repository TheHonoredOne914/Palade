import crypto from 'node:crypto'
import path from 'node:path'
import type { AgentFinding } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'

/**
 * Canonicalize a finding/chunk file path for matching: normalize backslashes
 * to forward slashes, then resolve internal "./"/"../" segments the way
 * path.posix.normalize does, and strip any leading "../"/"./" that a
 * relative reference from the LLM leaves dangling (these paths have no real
 * filesystem base to resolve against, so a leading "../src/foo.ts" is
 * treated the same as "src/foo.ts"). Case is preserved here — case-folding
 * happens separately in normalizePathKey, used only for the lookup/matching
 * key, so a finding's displayed filePath keeps its original casing.
 */
function normalizePath(p: string): string {
  const posixified = p.trim().replace(/\\/g, '/')
  return path.posix
    .normalize(posixified)
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
}

/**
 * Case-folded lookup key built on top of normalizePath, so a Windows-style
 * case mismatch between a finding's filePath and a chunk's filePath (e.g.
 * "C:/X.ts" vs "c:/x.ts") doesn't silently drop a finding that does
 * reference a reviewed file (orchestrator-004).
 */
function normalizePathKey(p: string): string {
  return normalizePath(p).toLowerCase()
}

function getMatchingChunkAndClamp(finding: AgentFinding, chunk: CodeChunk): AgentFinding | null {
  if (finding.lineStart === undefined) return finding
  // A non-integer lineStart (e.g. 12.5 from a tool that reports fractional
  // positions) used to be rejected outright — round instead of dropping a
  // finding that does reference a real, in-range location (orchestrator-005).
  const lineStart = Number.isInteger(finding.lineStart)
    ? finding.lineStart
    : Math.round(finding.lineStart)
  if (lineStart < chunk.startLine || lineStart > chunk.endLine) return null

  const clamped = { ...finding, lineStart }
  if (clamped.lineEnd !== undefined) {
    const lineEnd = Number.isInteger(clamped.lineEnd)
      ? clamped.lineEnd
      : Math.round(clamped.lineEnd)
    if (lineEnd < lineStart) {
      clamped.lineEnd = lineStart
    } else if (lineEnd > chunk.endLine) {
      clamped.lineEnd = chunk.endLine
    } else {
      clamped.lineEnd = lineEnd
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
    const key = normalizePathKey(chunk.filePath)
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
    const candidateChunks = chunksByPath.get(normalizePathKey(finding.filePath))
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
