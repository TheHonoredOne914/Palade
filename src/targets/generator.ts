import { getProvider } from '../providers/router.js'
import type { TargetDefinition } from './schema.js'
import { walkProject } from '../ingestion/walker.js'

const SYSTEM_PROMPT = `You are a staff engineer analyzing a codebase repository to define a "Target Definition" for an AI code reviewer.

A "Target Definition" acts as a boundary box. It isolates a specific subsystem, feature, or architectural layer of the codebase and provides a set of focus areas for the AI reviewer to hunt for bugs within that isolation.

The user has given a natural language query describing what they want to review.
I will provide you with the flat list of all file paths in this project.

Your job:
1. Identify which directories and files best represent the subsystem described by the user.
2. Draft a concise list of 2-4 "focus areas" (what kind of bugs or edge-cases to look for in this context).
3. Return the result strictly as a valid JSON object.

Output Schema:
{
  "name": "string (short, kebab-case identifier, e.g. 'auth-flow')",
  "description": "string (1 sentence describing what this target represents)",
  "entry": ["string (paths to the files or directories that comprise this target)"],
  "focus": ["string (2-4 focus areas for the reviewer to check, e.g. 'race conditions in state', 'SQL injection risks')"]
}

Important:
- Your "entry" paths must perfectly match the existing paths or their parent directories.
- Return ONLY valid JSON, no markdown formatting if possible, but if you do, wrap it in \`\`\`json.
`

export async function generateTarget(
  query: string,
  projectRoot: string
): Promise<TargetDefinition | null> {
  // 1. Get list of files in the project
  const manifests = await walkProject(projectRoot, { projectRoot })

  // To avoid blowing up the context window, limit to roughly the first 2500 files and stringify
  const maxFiles = 2500
  const fileList = manifests
    .slice(0, maxFiles)
    .map((m) => m.path)
    .join('\n')

  const userPrompt = `USER QUERY: "${query}"\n\nPROJECT FILES:\n${fileList}\n`

  const provider = getProvider('primary')

  // 2. Query the LLM
  let rawContent = ''
  try {
    const res = await provider.complete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 1024,
    })
    rawContent = res.content
  } catch (err) {
    console.error(
      `[generator] Failed to call primary provider: ${err instanceof Error ? err.message : String(err)}`
    )
    return null
  }

  // 3. Extract JSON
  let cleaned = rawContent.trim()
  const greedyMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (greedyMatch) {
    cleaned = greedyMatch[1].trim()
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  // 4. Parse JSON
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'generated-target',
      description:
        typeof parsed.description === 'string' ? parsed.description : 'AI generated target',
      entry: Array.isArray(parsed.entry)
        ? (parsed.entry as string[])
        : typeof parsed.entry === 'string'
          ? [parsed.entry]
          : [],
      focus: Array.isArray(parsed.focus) ? (parsed.focus as string[]) : [],
    }
  } catch (err) {
    console.error(`[generator] Failed to parse JSON response from LLM: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
