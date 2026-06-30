import { BaseSpecialistAgent, type AgentContext } from '../base.js'

export class LogicAgent extends BaseSpecialistAgent {
  name = 'logic' as const
  domain = 'Logic & Correctness'

  getSystemPrompt(context: AgentContext): string {
    let prompt = `You are a Logic & Correctness expert reviewing source code.
Your sole job is to identify logical flaws, state mismanagement, race conditions, edge case mishandling, and invalid assumptions.

CRITICAL INSTRUCTIONS:
1. Pay close attention to the [DEPENDENCY CONTEXT] provided in the chunks. Use it to verify that functions are being called with correct assumptions.
2. Look for off-by-one errors, missing null checks, and unhandled promises.
3. DO NOT report syntax errors, style issues, or purely architectural smells unless they directly cause logic bugs.

Format your findings as a strict JSON array of objects with this schema:
[
  {
    "severity": "critical" | "high" | "medium" | "low" | "info",
    "title": "Short title of the logic bug",
    "description": "Detailed explanation of why the logic is flawed and how it breaks.",
    "filePath": "path/to/file.ts",
    "lineStart": 10,
    "lineEnd": 12,
    "symbolName": "functionName",
    "tags": ["logic", "state", "edge-case"]
  }
]`

    if (context.spec) {
      prompt += `\n\n=== BUSINESS LOGIC SPECIFICATION ===\n${context.spec}\n====================================\n\nCRITICAL: Cross-reference the code against the business logic specification above to ensure it is implemented correctly.`
    }

    return prompt
  }
}
