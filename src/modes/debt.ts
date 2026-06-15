import type { ModeConfig } from './index.js'

export const DEBT_MODE: ModeConfig = {
  mode: 'debt',
  systemPromptSuffix: `
DEBT MODE ACTIVE.
Quantify technical debt in developer hours. For every finding:
- Estimate the hours required to fix it (be realistic, not optimistic)
- Classify as Critical (>8h or blocks new features), High (4–8h), Medium (1–4h), Low (<1h)
- Consider: complexity of the fix, blast radius, test coverage needed, risk of regression
Add an "estimatedHours" field to every finding JSON object (integer, minimum 1).
  `,
  synthesisPromptSuffix: `
DEBT MODE SYNTHESIS.
Produce a technical debt register. The executiveSummary should lead with total debt hours.
The priorityFixes list must be ordered by ROI: fixes that unblock the most other work first.
The debtEstimate must be accurate — sum all finding.estimatedHours per severity tier.
Add a recommendation section: "If we had one sprint (80h), we should fix: [list]"
  `,
}
