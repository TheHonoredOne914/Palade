import { existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import inquirer from 'inquirer'
import chalk from 'chalk'

const CONFIG_TEMPLATE = `// palade.config.ts
export default {
  providers: {
    groq: { apiKey: process.env.GROQ_API_KEY ?? '' },
    cerebras: { apiKey: process.env.CEREBRAS_API_KEY ?? '' },
  },
  swarm: {
    primary: 'groq',
    synthesis: 'cerebras',
  }
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

const GITIGNORE_APPEND = `
# Palade
palade.config.ts
.palade/
`

export async function initCommand(opts?: { yes?: boolean }): Promise<void> {
  const cwd = process.cwd()

  const configExists = existsSync(join(cwd, 'palade.config.ts'))
  const targetsExists = existsSync(join(cwd, 'palade.targets.ts'))
  const ignoreExists = existsSync(join(cwd, '.paladeignore'))

  const existingFiles: string[] = []
  if (configExists) existingFiles.push('palade.config.ts')
  if (targetsExists) existingFiles.push('palade.targets.ts')
  if (ignoreExists) existingFiles.push('.paladeignore')

  if (existingFiles.length > 0 && !opts?.yes) {
    const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
      {
        type: 'confirm',
        name: 'proceed',
        message: `${existingFiles.length} config file(s) already exist. Create missing files and update .gitignore?`,
        default: true
      }
    ])
    if (!proceed) {
      console.log(chalk.gray('Init cancelled.'))
      return
    }
  }

  const results: string[] = []

  // a) palade.config.ts
  if (configExists) {
    results.push('palade.config.ts already exists, skipping')
  } else {
    writeFileSync(join(cwd, 'palade.config.ts'), CONFIG_TEMPLATE, 'utf-8')
    results.push('palade.config.ts created')
  }

  // b) palade.targets.ts
  if (targetsExists) {
    results.push('palade.targets.ts already exists, skipping')
  } else {
    writeFileSync(join(cwd, 'palade.targets.ts'), TARGETS_TEMPLATE, 'utf-8')
    results.push('palade.targets.ts created')
  }

  // c) .paladeignore
  if (ignoreExists) {
    results.push('.paladeignore already exists, skipping')
  } else {
    writeFileSync(join(cwd, '.paladeignore'), IGNORE_TEMPLATE, 'utf-8')
    results.push('.paladeignore created')
  }

  // d) .palade/ directory
  const paladeDir = join(cwd, '.palade')
  if (!existsSync(paladeDir)) {
    mkdirSync(paladeDir, { recursive: true })
    results.push('.palade/ directory created')
  } else {
    results.push('.palade/ directory already exists, skipping')
  }

  // e) .gitignore
  const gitignorePath = join(cwd, '.gitignore')
  if (existsSync(gitignorePath)) {
    appendFileSync(gitignorePath, GITIGNORE_APPEND, 'utf-8')
    results.push('.gitignore updated')
  } else {
    writeFileSync(gitignorePath, GITIGNORE_APPEND.trimStart(), 'utf-8')
    results.push('.gitignore created')
  }

  // f) Print success
  console.log('\n' + results.map(r => `  ✓ ${r}`).join('\n'))
  console.log(`
Next steps:
  1. Add your API keys to palade.config.ts or set env vars
  2. Run: npx palade review
`)
}
