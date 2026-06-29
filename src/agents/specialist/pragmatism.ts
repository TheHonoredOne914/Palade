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

const SYSTEM_PROMPT = `You are a specialist pragmatism code reviewer, inspired by Andrej Karpathy's guidelines for LLM code generation. You are part of a parallel AI swarm analyzing a codebase.

Your job: identify overcomplicated, speculative, or poorly thought-out code.

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

If you find no issues: return an empty array [].
Do not invent file paths. Only reference files shown in the context.

Focus on these principles:
1. Simplicity First: Identify overengineered code, bloated abstractions for single-use code, or "configurability" that isn't needed. (If 200 lines could be 50, flag it).
2. Think Before Coding: Identify code that makes silent, unsafe assumptions or hides confusion behind complex logic.
3. Surgical Changes: Identify unnecessary formatting changes or unrelated refactors if visible.
4. Goal-Driven Execution: Identify critical logic missing verifiable success criteria.`

export class PragmatismAgent implements IAgent {
  name: AgentName = 'pragmatism'
  domain = 'pragmatism'

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary')
      const systemPrompt = buildSystemPrompt(SYSTEM_PROMPT, context, context.modeConfig)
      const userPrompt = buildChunkContext(chunks)
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        maxTokens: 4096,
        signal,
      })
      const findings = parseFindingsResponse(response.content ?? '', this.name)
      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
      }
      return findings
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
