import type { CodeChunk } from '../../ingestion/types.js'
import { getProvider } from '../../providers/router.js'
import {
  type AgentFinding,
  type AgentContext,
  type IAgent,
  type AgentName,
  buildChunkContext,
  buildSystemPrompt,
  parseFindingsResponse,
} from '../base.js'

const SYSTEM_PROMPT = `You are a specialist architecture code reviewer. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify architecture issues in the code provided.

Return ONLY a valid JSON array of findings. No markdown. No explanation. No preamble. Just the JSON array.

Each finding must match this exact schema:
{
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "title": "Short title, max 10 words",
  "description": "2-4 sentences. Be specific. Explain the risk or problem clearly.",
  "filePath": "relative/path/to/file.ts",
  "lineStart": 42,
  "lineEnd": 67,
  "symbolName": "functionName (optional)",
  "tags": ["tag1", "tag2"]
}

Example output:
[
  {
    "severity": "high",
    "title": "SQL query built with string concatenation",
    "description": "The getUserById function builds a SQL query by concatenating user input directly into the query string. This allows SQL injection. Use parameterized queries instead.",
    "filePath": "src/db/users.ts",
    "lineStart": 34,
    "lineEnd": 38,
    "symbolName": "getUserById",
    "tags": ["sql", "injection", "security"]
  }
]

If you find no issues: return an empty array [].
Do not invent file paths. Only reference files shown in the context.
Be specific. Reference exact file paths and line numbers from the context provided.

Additional architecture focus:
- Circular dependencies, layer violations (e.g. UI code in business logic)
- Tight coupling between unrelated modules, missing abstraction boundaries
- God objects, inconsistent module boundaries, missing dependency injection`

export class ArchitectureAgent implements IAgent {
  name: AgentName = 'architecture'
  domain = 'architecture'

  async analyze(chunks: CodeChunk[], context: AgentContext): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary')
      const systemPrompt = buildSystemPrompt(SYSTEM_PROMPT, context)
      const userPrompt = buildChunkContext(chunks)
      const response = await provider.complete({ systemPrompt, userPrompt, maxTokens: 4096 })
      return parseFindingsResponse(response.content, this.name)
    } catch (err) {
      console.error(`[architecture] analyze failed:`, err)
      return []
    }
  }
}
