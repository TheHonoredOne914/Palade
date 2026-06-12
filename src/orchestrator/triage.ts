import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import { getProvider } from '../providers/router.js'
import chalk from 'chalk'

const TRIAGE_SYSTEM_PROMPT = `You are a codebase triage assistant. Given a list of files in a project, identify which files are most likely to contain bugs, security issues, architectural problems, or dead code.

Return ONLY a valid JSON array of file paths. No explanation. No markdown. Just the array.
Example: ["src/auth/login.ts", "src/api/users.ts", "src/utils/crypto.ts"]

Select the 15 most interesting files. Prioritise:
- Files with "auth", "api", "route", "handler", "service", "middleware" in their name
- Large files (high line count)
- Files with "util", "helper", "common" that could have shared logic issues
- Config files that might have hardcoded values
- Files that look like they handle payments, sessions, or user data`

export async function triageFiles(
  manifests: FileManifest[],
  allChunks: CodeChunk[]
): Promise<CodeChunk[]> {
  console.log(chalk.cyan(`  [triage] Selecting high-value files from ${manifests.length} total...`))

  const compactManifest = manifests
    .map(m => `${m.path} (${m.linesOfCode} lines)`)
    .join('\n')

  const provider = getProvider('primary')

  try {
    const response = await provider.complete({
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      userPrompt: `Project files:\n${compactManifest}\n\nReturn the 15 most important files to review as a JSON array.`,
      maxTokens: 512,
      temperature: 0.1
    })

    let selectedPaths: string[] = []
    try {
      const match = response.content.match(/\[[\s\S]*\]/)
      if (match) {
        selectedPaths = JSON.parse(match[0])
      }
    } catch {
      // Triage parse failed — fall back to heuristic
    }

    if (selectedPaths.length > 0) {
      const selected = allChunks.filter(c =>
        selectedPaths.some(p => c.filePath.includes(p) || p.includes(c.filePath))
      )
      if (selected.length > 0) {
        console.log(chalk.cyan(`  [triage] Selected ${selected.length} chunks from ${selectedPaths.length} files`))
        return selected
      }
    }
  } catch {
    console.warn(chalk.yellow(`  [triage] Triage call failed, using heuristic selection`))
  }

  return heuristicSelect(manifests, allChunks)
}

function heuristicSelect(manifests: FileManifest[], allChunks: CodeChunk[]): CodeChunk[] {
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

  const topPaths = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(s => s.path)

  const selected = allChunks.filter(c => topPaths.includes(c.filePath))
  console.log(chalk.cyan(`  [triage] Heuristic selected ${selected.length} chunks from ${topPaths.length} files`))
  return selected
}
