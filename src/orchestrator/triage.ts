import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import { getProvider } from '../providers/router.js'
import chalk from 'chalk'

const DEFAULT_MAX_REVIEW_TOKENS = 200_000

const TRIAGE_SYSTEM_PROMPT = `You are a codebase triage assistant. Given a list of files in a project, rank them by likely importance for a code review (bugs, security issues, architectural problems, dead code).

Return ONLY a valid JSON array of file paths, ordered from most to least important. No explanation. No markdown. Just the array.
Example: ["src/auth/login.ts", "src/api/users.ts", "src/utils/crypto.ts"]

Prioritise:
- Files with "auth", "api", "route", "handler", "service", "middleware" in their name
- Large files (high line count)
- Files with "util", "helper", "common" that could have shared logic issues
- Config files that might have hardcoded values
- Files that look like they handle payments, sessions, or user data`

function estimateTokens(chunks: CodeChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.tokenCount, 0)
}

export async function triageFiles(
  manifests: FileManifest[],
  allChunks: CodeChunk[],
  maxReviewTokens?: number
): Promise<CodeChunk[]> {
  const budget = maxReviewTokens ?? DEFAULT_MAX_REVIEW_TOKENS
  const totalTokens = estimateTokens(allChunks)

  if (totalTokens <= budget) {
    console.log(chalk.cyan(`  [triage] Project fits within token budget (${totalTokens.toLocaleString()}/${budget.toLocaleString()} tokens) — reviewing all files`))
    return allChunks
  }

  console.log(chalk.cyan(`  [triage] Selecting high-value files from ${manifests.length} total (${totalTokens.toLocaleString()} tokens exceeds ${budget.toLocaleString()} token budget)...`))

  const compactManifest = manifests
    .map(m => `${m.path} (${m.linesOfCode} lines)`)
    .join('\n')

  try {
    const provider = getProvider('primary')

    const response = await provider.complete({
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      userPrompt: `Project files:\n${compactManifest}\n\nRank all files by importance. Return the full ranked list as a JSON array.`,
      maxTokens: 2048,
      temperature: 0.1
    })

    let rankedPaths: string[] = []
    try {
      let cleaned = response.content.trim()
      
      // Safely strip outer markdown code blocks using a greedy match
      const greedyMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
      if (greedyMatch) {
        cleaned = greedyMatch[1].trim()
      }

      // Find the outermost JSON array boundaries
      const arrayStart = cleaned.indexOf('[')
      const arrayEnd = cleaned.lastIndexOf(']')
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        cleaned = cleaned.substring(arrayStart, arrayEnd + 1)
      }

      rankedPaths = JSON.parse(cleaned)
    } catch {
      // Triage parse failed — fall back to heuristic
    }

    if (rankedPaths.length > 0 && rankedPaths.every(p => typeof p === 'string')) {
      const selected: CodeChunk[] = []
      let tokensUsed = 0

      for (const rankedPath of rankedPaths as string[]) {
        if (tokensUsed >= budget) break
        const clean = rankedPath.trim().replace(/^\.?\/+/, '').replace(/\/+$/, '')
        const matching = allChunks.filter(c => {
          const cp = c.filePath.replace(/^\.?\/+/, '')
          if (cp === clean || cp.endsWith('/' + clean)) return true
          return false
        })
        for (const chunk of matching) {
          if (tokensUsed + chunk.tokenCount > budget) break
          selected.push(chunk)
          tokensUsed += chunk.tokenCount
        }
      }

      if (selected.length > 0) {
        console.log(chalk.cyan(`  [triage] Selected ${selected.length} chunks (${tokensUsed.toLocaleString()} tokens) from ${selected.length > 0 ? new Set(selected.map(c => c.filePath)).size : 0} files`))
        return selected
      }
    }
  } catch {
    console.warn(chalk.yellow(`  [triage] Triage call failed, using heuristic selection`))
  }

  return heuristicSelect(manifests, allChunks, budget)
}

function heuristicSelect(manifests: FileManifest[], allChunks: CodeChunk[], budget: number): CodeChunk[] {
  const scored = manifests.map(m => {
    let score = 0
    const p = m.path.toLowerCase()

    if (/auth|login|session|token|password|secret|key/.test(p)) score += 10
    if (/api|route|handler|controller|endpoint/.test(p)) score += 8
    if (/service|repository|dao|store/.test(p)) score += 6
    if (/middleware|interceptor|guard/.test(p)) score += 6
    if (/payment|billing|stripe|webhook/.test(p)) score += 9
    if (/util|helper|common|shared/.test(p)) score += 4
    if (/config|env|settings/.test(p)) score += 7

    if (/test|spec|mock|fixture/.test(p)) score -= 5
    if (/migration|seed/.test(p)) score -= 3
    if (/type|interface|dto/.test(p)) score -= 2

    score += Math.min(m.linesOfCode / 50, 5)

    return { path: m.path, score }
  })

  const sortedPaths = scored
    .sort((a, b) => b.score - a.score)
    .map(s => s.path)

  const selected: CodeChunk[] = []
  let tokensUsed = 0

  for (const path of sortedPaths) {
    if (tokensUsed >= budget) break
    const matching = allChunks.filter(c => c.filePath === path)
    for (const chunk of matching) {
      if (tokensUsed + chunk.tokenCount > budget) break
      selected.push(chunk)
      tokensUsed += chunk.tokenCount
    }
  }

  console.log(chalk.cyan(`  [triage] Heuristic selected ${selected.length} chunks (${tokensUsed.toLocaleString()} tokens) from ${new Set(selected.map(c => c.filePath)).size} files`))
  return selected
}
