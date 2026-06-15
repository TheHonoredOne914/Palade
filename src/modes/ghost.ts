import type { ModeConfig } from './index.js'

export const GHOST_MODE: ModeConfig = {
  mode: 'ghost',
  agentOverrides: ['deadCode'],
  systemPromptSuffix: `
GHOST HUNT MODE ACTIVE.
Your sole mission: find dead code, zombie features, and unwired implementations.

Hunt specifically for:
- Exported functions, classes, or constants that are never imported anywhere
- Fully implemented classes that are never instantiated
- Route handlers defined but unreachable from any known entry point
- Feature flags that are always false or always true (hard-coded)
- Commented-out code blocks that appear to be fully working implementations
- Files that exist but are never imported (orphan modules)
- Interfaces or types defined but never used

For each ghost: estimate the developer-hours spent building it.
Add a "hoursWasted" field to every finding (integer).
Severity: always 'low' unless the ghost contains sensitive logic (auth, payments) → 'high'.
  `,
  synthesisPromptSuffix: `
GHOST HUNT SYNTHESIS.
Produce a Ghost Report. executiveSummary should lead with:
"X ghost features found. Estimated Y developer-hours wasted building unused code."
List ghosts in order of estimated hours wasted (highest first).
The debtEstimate.highestROIFix should reference the largest ghost to delete.
  `,
}
