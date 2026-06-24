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

const SYSTEM_PROMPT = `You are a specialist test intelligence code reviewer. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify test intelligence issues in the code provided.

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

Additional test intelligence focus:
- Critical business logic with zero test coverage
- Tests that mock everything and assert nothing meaningful
- Missing edge case tests on validation functions
- Test files that import but never call the functions under test
- Async functions tested synchronously`

export class TestIntelligenceAgent implements IAgent {
  name: AgentName = 'testIntelligence'
  domain = 'test intelligence'

  async analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary')
      const systemPrompt = buildSystemPrompt(SYSTEM_PROMPT, context)
      const userPrompt = buildChunkContext(chunks)
      const response = await provider.complete({ systemPrompt, userPrompt, maxTokens: 4096, signal })
      return parseFindingsResponse(response.content ?? '', this.name)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      console.error(`[testIntelligence] analyze failed:`, err)
      return []
    }
  }
}
