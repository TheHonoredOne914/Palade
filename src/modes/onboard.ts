import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ModeConfig } from './index.js'

export const ONBOARD_MODE: ModeConfig = {
  mode: 'onboard',
  agentOverrides: ['architecture', 'maintainability'],
  systemPromptSuffix: `
ONBOARD MODE ACTIVE.
Your job is not to find bugs — it is to explain the codebase to a new developer joining the team.
Produce findings that describe: what each major module does, how data flows between them,
which files are the most dangerous or fragile, and what implicit conventions exist in the code.
Frame everything as documentation, not criticism.
Use severity 'info' for all findings in this mode.
  `,
  synthesisPromptSuffix: `
You are producing onboarding documentation for a new engineer.
Generate the following four documents as separate sections, each starting with a markdown H2 header:

## ARCHITECTURE.md
Describe the system architecture: major modules, their responsibilities, and how they connect.
Include a text-based ASCII system diagram if the structure is complex.

## DATA_FLOWS.md
Describe how data enters the system, transforms, and exits.
Trace at least 3 major data flows end-to-end.

## DANGER_ZONES.md
List the most fragile, complex, or critical files in the codebase.
Explain why each is dangerous and what new developers should be careful about.

## GOTCHAS.md
List implicit conventions, non-obvious patterns, and common mistakes a new developer would make.
Examples: "Don't call X before Y", "All routes require the Z middleware", "This module mutates state".

Return plain text with these four sections. This will be written to four separate .md files.
  `,
  outputOverride: 'onboard',
}

export async function writeOnboardDocs(
  synthesisText: string,
  outputDir: string
): Promise<string[]> {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const sections = [
    { marker: '## ARCHITECTURE.md', file: 'ARCHITECTURE.md' },
    { marker: '## DATA_FLOWS.md', file: 'DATA_FLOWS.md' },
    { marker: '## DANGER_ZONES.md', file: 'DANGER_ZONES.md' },
    { marker: '## GOTCHAS.md', file: 'GOTCHAS.md' },
  ]

  const paths: string[] = []

  for (let i = 0; i < sections.length; i++) {
    const start = synthesisText.indexOf(sections[i].marker)
    if (start === -1) continue

    // Find the next marker that actually occurs in the text, skipping any
    // sections the LLM omitted, so a missing marker can't swallow later sections.
    let end = synthesisText.length
    for (let j = i + 1; j < sections.length; j++) {
      const idx = synthesisText.indexOf(sections[j].marker, start + 1)
      if (idx !== -1) {
        end = idx
        break
      }
    }
    const content = synthesisText.slice(start, end).trim()

    const filePath = join(outputDir, sections[i].file)
    writeFileSync(filePath, content, 'utf-8')
    paths.push(filePath)
  }

  return paths
}
