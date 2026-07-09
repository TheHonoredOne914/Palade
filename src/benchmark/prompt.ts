export const DIAGNOSTIC_PROMPT = `You are one agent in a code-audit swarm benchmarking run.

Audit ONLY the following two files for genuine, reproducible defects:
  1. src/orchestrator/scheduler.ts
  2. src/orchestrator/findingValidation.ts

Rules:
- Report ONLY defects you can justify by reading the code. Do NOT assume a
  defect exists just because a prior research report hypothesized it.
- Do NOT flag by-design behavior (e.g. intentional overlap between split
  chunks, or dropping findings whose line range falls outside all reviewed
  chunks) as a bug.
- A defect is genuine only if it can cause wrong output, data loss, an
  uncaught error, or an invariant violation under some realistic input.

Output format: emit a JSON array of objects, one per claimed defect:
[
  {
    "file": "src/orchestrator/scheduler.ts",
    "lineStart": 91,
    "lineEnd": 93,
    "severity": "medium",
    "claim": "one sentence describing the concrete defect and its trigger"
  }
]
Line numbers refer to the exact source lines. Do not emit anything else.`

export function formatPromptForAgent(agentName: string): string {
  return `Agent: ${agentName}\n\n${DIAGNOSTIC_PROMPT}`
}
