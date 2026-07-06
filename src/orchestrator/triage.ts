import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import { getProvider } from '../providers/router.js'
import { CliExitError } from '../errors/types.js'
import { estimateTotalTokens } from './scheduler.js'
import chalk from 'chalk'

const DEFAULT_MAX_REVIEW_TOKENS = 200_000

const TRIAGE_SYSTEM_PROMPT = `You are a codebase triage assistant. Given a list of files in a project, rank them by likely importance for a code review (bugs, security issues, architectural problems, dead code).

Return ONLY a valid JSON array of file paths, ordered from most to least important. No explanation. No markdown. Just the array.
Example: ["src/auth/login.ts", "src/api/users.ts", "src/utils/crypto.ts"]

Prioritise:
- Files with high Git Churn (frequently modified)
- Files with high Centrality (many imports or imported by many)
- Files with "auth", "api", "route", "handler", "service", "middleware" in their name
- Large files (high line count)
- Files with "util", "helper", "common" that could have shared logic issues
- Config files that might have hardcoded values
- Files that look like they handle payments, sessions, or user data`

export async function triageFiles(
  manifests: FileManifest[],
  allChunks: CodeChunk[],
  options?: { maxReviewTokens?: number; strictTriage?: boolean }
): Promise<CodeChunk[]> {
  const budget = options?.maxReviewTokens ?? DEFAULT_MAX_REVIEW_TOKENS
  const totalTokens = estimateTotalTokens(allChunks)

  if (totalTokens <= budget) {
    console.log(
      chalk.cyan(
        `  [triage] Project fits within token budget (${totalTokens.toLocaleString()}/${budget.toLocaleString()} tokens) — reviewing all files`
      )
    )
    return allChunks
  }

  console.log(
    chalk.red(
      `  [!] WARNING: Project token count (${totalTokens.toLocaleString()}) exceeds budget (${budget.toLocaleString()}). Some files will be silently dropped from the review.`
    )
  )

  if (options?.strictTriage) {
    console.log(
      chalk.red(
        `  [!] Strict triage is enabled. Halting review. Please narrow your scope using --include or increase token budget.`
      )
    )
    throw new CliExitError(1)
  }

  console.log(chalk.cyan(`  [triage] Selecting high-value files from ${manifests.length} total...`))

  const compactManifest = manifests
    .map(
      (m) =>
        `${m.path} (${m.linesOfCode} lines, Churn: ${m.churnCount || 0}, Imports: ${m.importCount || 0})`
    )
    .join('\n')

  try {
    const provider = getProvider('primary')

    const response = await provider.complete({
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      userPrompt: `Project files:\n${compactManifest}\n\nRank all files by importance. Return the full ranked list as a JSON array.`,
      maxTokens: 2048,
      temperature: 0.1,
    })

    let rankedPaths: string[] = []
    try {
      let cleaned = response.content.trim()

      // Strip outer markdown code blocks — prefer the block containing a JSON array
      const allBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
      if (allBlocks.length > 0) {
        const jsonBlock = allBlocks.find((m) => m[1].trim().startsWith('['))
        cleaned = (jsonBlock ?? allBlocks[allBlocks.length - 1])[1].trim()
      }

      // Find the outermost JSON array boundaries
      const arrayStart = cleaned.indexOf('[')
      const arrayEnd = cleaned.lastIndexOf(']')
      if (arrayStart !== -1 && arrayEnd > arrayStart) {
        cleaned = cleaned.substring(arrayStart, arrayEnd + 1)
      }

      rankedPaths = JSON.parse(cleaned)
    } catch (err) {
      console.warn(
        chalk.yellow(
          `  [triage] Failed to parse LLM array JSON: ${err instanceof Error ? err.message : String(err)}`
        )
      )
    }

    const validPaths = Array.isArray(rankedPaths)
      ? rankedPaths.filter((p) => typeof p === 'string')
      : []

    if (validPaths.length > 0) {
      const selected: CodeChunk[] = []
      const seenChunkIds = new Set<string>()
      let tokensUsed = 0

      for (const rankedPath of validPaths) {
        if (tokensUsed >= budget) break
        const clean = rankedPath
          .trim()
          .replace(/^\.?\/+/, '')
          .replace(/\/+$/, '')
        // Exact path match first. Fall back to a suffix match only when it
        // identifies a SINGLE file — an ambiguous suffix (e.g. `utils/helper.ts`
        // matching two different directories) would pull unranked files into
        // the budget.
        let matching = allChunks.filter((c) => c.filePath.replace(/^\.?\/+/, '') === clean)
        if (matching.length === 0) {
          const suffixMatches = allChunks.filter((c) =>
            c.filePath.replace(/^\.?\/+/, '').endsWith('/' + clean)
          )
          const distinctFiles = new Set(suffixMatches.map((c) => c.filePath))
          if (distinctFiles.size === 1) matching = suffixMatches
        }
        if (matching.length === 0) {
          // The LLM's ranked-path output isn't guaranteed byte-exact — fall
          // back to a case-insensitive exact match, single-file only, before
          // dropping this ranked path from the review entirely.
          const cleanLower = clean.toLowerCase()
          const ciMatches = allChunks.filter(
            (c) => c.filePath.replace(/^\.?\/+/, '').toLowerCase() === cleanLower
          )
          const distinctFiles = new Set(ciMatches.map((c) => c.filePath))
          if (distinctFiles.size === 1) matching = ciMatches
        }
        for (const chunk of matching) {
          if (seenChunkIds.has(chunk.id)) continue
          if (tokensUsed + chunk.tokenCount > budget) break
          selected.push(chunk)
          seenChunkIds.add(chunk.id)
          tokensUsed += chunk.tokenCount
        }
      }

      if (selected.length > 0) {
        // Automatically append imported sibling files (blast radius expansion)
        const selectedPaths = new Set(selected.map((c) => c.filePath))
        for (const m of manifests) {
          if (m.importers && m.importers.length > 0 && !selectedPaths.has(m.path)) {
            // Check if any of its importers were selected
            const hasSelectedImporter = m.importers.some((imp) => {
              return selected.some((c) => c.filePath === imp || c.filePath.endsWith('/' + imp))
            })
            if (hasSelectedImporter) {
              const matchingChunks = allChunks.filter((c) => c.filePath === m.path)
              for (const chunk of matchingChunks) {
                if (seenChunkIds.has(chunk.id)) continue
                if (tokensUsed + chunk.tokenCount > budget) break
                selected.push(chunk)
                seenChunkIds.add(chunk.id)
                tokensUsed += chunk.tokenCount
              }
            }
          }
        }

        console.log(
          chalk.cyan(
            `  [triage] Selected ${selected.length} chunks (${tokensUsed.toLocaleString()} tokens) from ${selected.length > 0 ? new Set(selected.map((c) => c.filePath)).size : 0} files`
          )
        )
        return selected
      }
    }
  } catch {
    console.warn(chalk.yellow(`  [triage] Triage call failed, using heuristic selection`))
  }

  return heuristicSelect(manifests, allChunks, budget)
}

export function scoreManifestForReview(m: FileManifest): number {
  let score = 0
  const p = m.path.toLowerCase()

  if (/auth|login|session|token|password|secret|key/.test(p)) score += 10
  if (/api|route|handler|controller|endpoint/.test(p)) score += 8
  if (/service|repository|dao|store/.test(p)) score += 6
  if (/middleware|interceptor|guard|acl|permission|policy|tenant|scope|rbac|access/.test(p)) {
    score += 8
  }
  if (/runtime|vm|sandbox|exec|spawn|crypto|eval/.test(p)) score += 10
  if (/payment|billing|stripe|webhook/.test(p)) score += 9
  if (/util|helper|common|shared/.test(p)) score += 4
  if (/config|env|settings/.test(p)) score += 7

  if (/test|spec|mock|fixture/.test(p)) score -= 5

  const boundaryTypeFile =
    /(auth|user|payment|session|security|permission|policy|rbac).*(type|interface|dto)/.test(p) ||
    /(type|interface|dto).*(auth|user|payment|session|security|permission|policy|rbac)/.test(p)

  if (/type|interface|dto/.test(p) && !boundaryTypeFile) score -= 2

  score += Math.min(m.linesOfCode / 50, 5)
  return score
}

function heuristicSelect(
  manifests: FileManifest[],
  allChunks: CodeChunk[],
  budget: number
): CodeChunk[] {
  const scored = manifests.map((m) => {
    return { path: m.path, score: scoreManifestForReview(m) }
  })

  const sortedPaths = [...new Set(scored.sort((a, b) => b.score - a.score).map((s) => s.path))]

  const selected: CodeChunk[] = []
  let tokensUsed = 0

  for (const path of sortedPaths) {
    if (tokensUsed >= budget) break
    const matching = allChunks.filter((c) => c.filePath === path)
    for (const chunk of matching) {
      if (tokensUsed + chunk.tokenCount > budget) break
      selected.push(chunk)
      tokensUsed += chunk.tokenCount
    }
  }

  console.log(
    chalk.cyan(
      `  [triage] Heuristic selected ${selected.length} chunks (${tokensUsed.toLocaleString()} tokens) from ${new Set(selected.map((c) => c.filePath)).size} files`
    )
  )
  return selected
}
