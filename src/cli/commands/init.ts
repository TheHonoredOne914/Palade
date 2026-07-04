import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { askConfirm } from '../../ui/prompt.js'
import chalk from 'chalk'

const CONFIG_TEMPLATE = `// palade.config.ts
export default {
  // AI providers are auto-detected from environment variables
  // e.g., GROQ_API_KEY, OPENROUTER_API_KEY, etc.
  
  // swarm: {
  //   agentCount: 6,
  //   economyMode: true, // Set to false to opt-in to max per-domain prompt richness at higher cost
  // }
}
`

const TARGETS_TEMPLATE = `// palade.targets.ts
// Define named subsystems to audit with focused agent context.
export default [
  // {
  //   name: 'my-feature',
  //   description: 'Describe what this subsystem does and what to look for',
  //   entry: ['src/my-feature/'],
  //   focus: ['data flow', 'error handling'],
  // }
]
`

const AGENTS_TEMPLATE = `// palade.agents.ts
// Define custom specialist agents to run alongside the built-in swarm.
// Each agent gets its own system prompt and runs through the same provider pipeline.
export default [
  // {
  //   name: 'api-design',
  //   domain: 'API Design',
  //   systemPrompt: \`You are an API design reviewer. Check for:
  //   - Consistent naming conventions across endpoints
  //   - Proper HTTP method usage (GET for reads, POST for creates, etc.)
  //   - Request/response schema consistency
  //   - Pagination, error handling, and versioning patterns
  //   Return ONLY a valid JSON array of findings.\`,
  // },
]
`

const IGNORE_TEMPLATE = `node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
`

const CONSTITUTION_TEMPLATE = `# Palade Agent Constitution

_Ponytail (YAGNI/minimalism) and Karpathy (assumptions/surgical-changes/verification)
review lenses are already applied to every agent by default — no need to restate them
here. Add project-specific guidelines below._

GSD & GSTACK REVIEW LENSES:
- Milestone Alignment (GSD): Flag code that doesn't push the core milestone forward or skips essential audit-fix phase gates. Demand rigorous test coverage for core flows.
- Frontend & UI Robustness (GStack): Enforce UI/UX design checklists where applicable. Flag brittle browser automation, missing error handling for network interactions, and DevEx bottlenecks.
`

const GITIGNORE_APPEND = `
# Palade
.palade/
`

export async function initCommand(opts?: { yes?: boolean }): Promise<void> {
  const cwd = process.cwd()

  const configExists = existsSync(join(cwd, '.palade', 'palade.config.ts'))
  const targetsExists = existsSync(join(cwd, '.palade', 'palade.targets.ts'))
  const agentsExists = existsSync(join(cwd, '.palade', 'palade.agents.ts'))
  const ignoreExists = existsSync(join(cwd, '.palade', 'ignore'))

  const existingFiles: string[] = []
  if (configExists) existingFiles.push('.palade/palade.config.ts')
  if (targetsExists) existingFiles.push('.palade/palade.targets.ts')
  if (agentsExists) existingFiles.push('.palade/palade.agents.ts')
  if (ignoreExists) existingFiles.push('.palade/ignore')

  if (existingFiles.length > 0 && !opts?.yes) {
    if (!process.stdin.isTTY) {
      // Non-interactive: skip existing, only create missing
    } else {
      const proceed = await askConfirm(
        `${existingFiles.length} config file(s) already exist. Create missing files and update .gitignore?`
      )
      if (!proceed) {
        console.log(chalk.gray('Init cancelled.'))
        return
      }
    }
  }

  const results: string[] = []

  // a) .palade/ directory (must create first)
  const paladeDir = join(cwd, '.palade')
  if (!existsSync(paladeDir)) {
    mkdirSync(paladeDir, { recursive: true })
    results.push('.palade/ directory created')
  } else {
    results.push('.palade/ directory already exists, skipping')
  }

  // b) palade.config.ts
  if (configExists) {
    results.push('.palade/palade.config.ts already exists, skipping')
  } else {
    writeFileSync(join(paladeDir, 'palade.config.ts'), CONFIG_TEMPLATE, 'utf-8')
    results.push('.palade/palade.config.ts created')
  }

  // c) palade.targets.ts
  if (targetsExists) {
    results.push('.palade/palade.targets.ts already exists, skipping')
  } else {
    writeFileSync(join(paladeDir, 'palade.targets.ts'), TARGETS_TEMPLATE, 'utf-8')
    results.push('.palade/palade.targets.ts created')
  }

  // d) palade.agents.ts
  if (agentsExists) {
    results.push('.palade/palade.agents.ts already exists, skipping')
  } else {
    writeFileSync(join(paladeDir, 'palade.agents.ts'), AGENTS_TEMPLATE, 'utf-8')
    results.push('.palade/palade.agents.ts created')
  }

  // e) ignore
  if (ignoreExists) {
    results.push('.palade/ignore already exists, skipping')
  } else {
    writeFileSync(join(paladeDir, 'ignore'), IGNORE_TEMPLATE, 'utf-8')
    results.push('.palade/ignore created')
  }

  // f) constitution.md
  const constExists = existsSync(join(paladeDir, 'constitution.md'))
  if (constExists) {
    results.push('.palade/constitution.md already exists, skipping')
  } else {
    writeFileSync(join(paladeDir, 'constitution.md'), CONSTITUTION_TEMPLATE, 'utf-8')
    results.push('.palade/constitution.md created')
  }

  // g) .gitignore
  const gitignorePath = join(cwd, '.gitignore')
  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8')
    if (!existing.includes('# Palade')) {
      appendFileSync(gitignorePath, GITIGNORE_APPEND, 'utf-8')
      results.push('.gitignore updated')
    } else {
      results.push('.gitignore already has Palade entries, skipping')
    }
  } else {
    writeFileSync(gitignorePath, GITIGNORE_APPEND.trimStart(), 'utf-8')
    results.push('.gitignore created')
  }

  // f) Print success
  console.log('\n' + results.map((r) => `  ✓ ${r}`).join('\n'))

  try {
    const { loadConfig } = await import('../../config/loader.js')
    const config = await loadConfig()
    console.log(chalk.cyan(`\nProviders initialized:`))
    console.log(chalk.gray(`  Primary:   ${config.swarm.primary}`))
    console.log(chalk.gray(`  Synthesis: ${config.swarm.synthesis}`))
  } catch (e) {
    // ignore if config fails to load
  }

  console.log(`
Next steps:
  1. Add your API keys to .palade/palade.config.ts or set env vars
  2. Run: npx palade review
`)
}
