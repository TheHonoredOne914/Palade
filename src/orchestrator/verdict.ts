import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { z } from 'zod'
import { getRouter } from '../providers/router.js'
import type { AgentFinding, AgentContext } from '../agents/base.js'
import type { ChangedFile } from '../diff/types.js'

export interface Conflict {
  filePath: string
  lineStart: number
  lineEnd: number
  sideA: AgentFinding
  sideB: AgentFinding
}

export interface Verdict {
  decision: string
  tradeoff_accepted: string
  confidence: number
  losing_side: string
}

const HARDEN_KEYWORDS = [
  'add', 'throttle', 'encrypt', 'validate', 'lock', 'strict', 'check',
  'boundary', 'limit', 'ensure', 'harden', 'guard', 'require', 'prevent'
]

const RELAX_KEYWORDS = [
  'remove', 'skip', 'fast-path', 'relax', 'bypass', 'inline', 'delete',
  'cache', 'memoize', 'omit', 'drop', 'ignore', 'simplify', 'fast'
]

function getValence(text: string): 'harden' | 'relax' | 'neutral' {
  const t = text.toLowerCase()
  let hardenHits = 0
  let relaxHits = 0
  for (const w of HARDEN_KEYWORDS) {
    if (t.includes(w)) hardenHits++
  }
  for (const w of RELAX_KEYWORDS) {
    if (t.includes(w)) relaxHits++
  }
  if (hardenHits > relaxHits) return 'harden'
  if (relaxHits > hardenHits) return 'relax'
  return 'neutral'
}

export function detectConflicts(findings: AgentFinding[]): Conflict[] {
  const conflicts: Conflict[] = []
  const grouped = new Map<string, AgentFinding[]>()

  for (const f of findings) {
    if (!f.filePath || f.lineStart === undefined || f.lineEnd === undefined) continue
    const list = grouped.get(f.filePath) ?? []
    list.push(f)
    grouped.set(f.filePath, list)
  }

  for (const [filePath, fileFindings] of grouped.entries()) {
    const matched = new Set<string>()

    for (let i = 0; i < fileFindings.length; i++) {
      const a = fileFindings[i]
      for (let j = i + 1; j < fileFindings.length; j++) {
        const b = fileFindings[j]

        // Must be from different agents
        if (a.agentName === b.agentName) continue

        // Check line overlap (or adjacent within 5 lines)
        const overlap =
          (a.lineStart! <= b.lineEnd! + 5) && (b.lineStart! <= a.lineEnd! + 5)

        if (!overlap) continue

        const valA = getValence(a.title + ' ' + a.description)
        const valB = getValence(b.title + ' ' + b.description)

        // If opposite valences, it's a conflict
        if ((valA === 'harden' && valB === 'relax') || (valA === 'relax' && valB === 'harden')) {
          const key = `${i}-${j}`
          if (!matched.has(key)) {
            matched.add(key)
            conflicts.push({
              filePath,
              lineStart: Math.min(a.lineStart!, b.lineStart!),
              lineEnd: Math.max(a.lineEnd!, b.lineEnd!),
              sideA: a,
              sideB: b,
            })
          }
        }
      }
    }
  }

  return conflicts
}

const VerdictSchema = z.object({
  decision: z.string().describe('What to actually do'),
  tradeoff_accepted: z.string().describe('The explicit cost being accepted'),
  confidence: z.number().describe('0-100 score of how confident you are in this tradeoff'),
  losing_side: z.string().describe('Which agent recommendation was NOT taken, and why')
})

export async function arbitrateConflict(
  conflict: Conflict,
  context: AgentContext,
  signal?: AbortSignal
): Promise<Verdict | null> {
  const router = getRouter()

  const systemPrompt = `You are the Lead Architect. Two specialized agents disagree on a piece of code.
Your job is to resolve the conflict by making a definitive architectural decision. Accept a tradeoff explicitly.

Respond ONLY with JSON matching this schema:
{
  "decision": "string (what to actually do)",
  "tradeoff_accepted": "string (the explicit cost being accepted)",
  "confidence": "number (0-100)",
  "losing_side": "string (which agent's recommendation was NOT taken, and why)"
}`

  const userPrompt = `File: ${conflict.filePath}:${conflict.lineStart}-${conflict.lineEnd}

Agent [${conflict.sideA.agentName}] says:
Title: ${conflict.sideA.title}
Reasoning: ${conflict.sideA.description}

Agent [${conflict.sideB.agentName}] says:
Title: ${conflict.sideB.title}
Reasoning: ${conflict.sideB.description}

Please provide your verdict.`

  try {
    const rawOutput = await router.complete(
      {
        model: context.modeConfig?.agentOverrides?.[0]?.model || 'groq:llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
      },
      signal
    )

    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : rawOutput

    const parsed = JSON.parse(jsonStr)
    return VerdictSchema.parse(parsed)
  } catch (err) {
    console.error(chalk.yellow(`\n[verdict] Arbitration failed for ${conflict.filePath}: ${err instanceof Error ? err.message : String(err)}`))
    return null
  }
}

export async function saveDecision(
  projectRoot: string,
  conflict: Conflict,
  verdict: Verdict
): Promise<string> {
  const slugBase = conflict.filePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'decision'
  const hash = crypto.createHash('md5').update(conflict.filePath + conflict.lineStart + verdict.decision).digest('hex').slice(0, 6)
  const slug = `${slugBase}-${hash}`
  const dateStr = new Date().toISOString().split('T')[0]

  const markdown = `# ${slug}

**Date:** ${dateStr}
**File:** ${conflict.filePath}:${conflict.lineStart}-${conflict.lineEnd}
**Status:** Accepted

## Conflict
- **${conflict.sideA.agentName}:** ${conflict.sideA.title} - ${conflict.sideA.description}
- **${conflict.sideB.agentName}:** ${conflict.sideB.title} - ${conflict.sideB.description}

## Decision
${verdict.decision}

## Tradeoff accepted
${verdict.tradeoff_accepted}

## Losing side
${verdict.losing_side}

## Confidence
${verdict.confidence}%
`

  const dir = join(projectRoot, '.palade', 'decisions')
  await mkdir(dir, { recursive: true })
  const filepath = join(dir, `${slug}.md`)
  await writeFile(filepath, markdown, 'utf-8')

  return slug
}

export async function checkDecisionDrift(
  projectRoot: string,
  changedFiles: ChangedFile[]
): Promise<string[]> {
  const dir = join(projectRoot, '.palade', 'decisions')
  if (!existsSync(dir)) return []

  const files = await readdir(dir)
  const mdFiles = files.filter(f => f.endsWith('.md'))
  if (mdFiles.length === 0) return []

  // Build map of diff additions by file
  const addedByPath = new Map<string, number[]>()
  for (const cf of changedFiles) {
    if (cf.diff && cf.status !== 'deleted') {
      const lines: number[] = []
      let headLine = 0
      for (const line of cf.diff.split('\\n')) {
        if (line.startsWith('@@')) {
          const match = line.match(/\\+(\\d+)/)
          if (match) headLine = parseInt(match[1], 10)
          continue
        }
        if (line.startsWith('+++') || line.startsWith('---')) continue
        if (line.startsWith('+')) {
          lines.push(headLine)
          headLine++
        } else if (!line.startsWith('-')) {
          headLine++
        }
      }
      addedByPath.set(cf.path, lines)
    }
  }

  const warnings: string[] = []
  const router = getRouter()

  for (const file of mdFiles) {
    const content = await readFile(join(dir, file), 'utf-8')
    const match = content.match(/\\*\\*File:\\*\\*\\s+(.+):(\\d+)-(\\d+)/)
    if (!match) continue

    const decisionPath = match[1]
    const start = parseInt(match[2], 10)
    const end = parseInt(match[3], 10)

    const editedLines = addedByPath.get(decisionPath)
    if (!editedLines) continue

    const overlaps = editedLines.some(l => l >= start && l <= end)
    if (!overlaps) continue

    // There is an overlap! Trigger LLM check to see if it violates
    const cf = changedFiles.find(c => c.path === decisionPath)
    if (!cf || !cf.diff) continue

    const systemPrompt = `You are Drift Watcher.
A user is making changes to a file that has a documented architectural decision.
Does their git diff violate the accepted decision?
Respond with ONLY "YES" or "NO".`

    const userPrompt = `DECISION DOCUMENT:
${content}

GIT DIFF:
${cf.diff}`

    try {
      const result = await router.complete({
        model: 'groq:llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1
      })

      if (result.trim().toUpperCase().includes('YES')) {
        warnings.push(`You're editing logic that contradicts a documented decision (${file}).`)
      }
    } catch (e) {
      // ignore LLM failure in watch mode
    }
  }

  return warnings
}
