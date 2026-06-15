import inquirer from 'inquirer'
import chalk from 'chalk'
import { theme } from './theme.js'
import { sectionBox } from './layout.js'
import { readFile, writeFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const Inq = inquirer as unknown as {
  Separator: new (line?: string) => string & { __separator: true }
  prompt: typeof inquirer.prompt
}

export async function launchSettingsUI(projectRoot: string): Promise<void> {
  console.log(
    sectionBox(
      'Settings',
      [
        `  ${theme.dim('Configure Palade for this project.')}`,
        `  ${theme.dim('Changes are saved to')} ${chalk.cyan('palade.config.ts')}`,
      ].join('\n')
    )
  )

  await mainMenu(projectRoot)
}

async function mainMenu(projectRoot: string): Promise<void> {
  while (true) {
    const { section } = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: theme.primaryBold('What do you want to configure?'),
        choices: [
          {
            name: `  ${theme.accent('◆')} Providers          — API keys, models, concurrency`,
            value: 'providers',
          },
          {
            name: `  ${theme.accent('◆')} Swarm              — agent count, timeout, routing`,
            value: 'swarm',
          },
          {
            name: `  ${theme.accent('◆')} Output             — formats, report directory, browser`,
            value: 'output',
          },
          {
            name: `  ${theme.accent('◆')} Score & Badge      — history file, badge path`,
            value: 'score',
          },
          {
            name: `  ${theme.accent('◆')} Ignore Rules       — edit .paladeignore`,
            value: 'ignore',
          },
          new Inq.Separator(theme.dim('─'.repeat(50))),
          {
            name: `  ${theme.dim('✕')} ${theme.dim('Exit settings')}`,
            value: 'exit',
          },
        ],
      },
    ])

    if (section === 'exit') break

    switch (section) {
      case 'providers':
        await providersMenu(projectRoot)
        break
      case 'swarm':
        await swarmMenu(projectRoot)
        break
      case 'output':
        await outputMenu(projectRoot)
        break
      case 'score':
        await scoreMenu(projectRoot)
        break
      case 'ignore':
        await ignoreMenu(projectRoot)
        break
    }
  }

  console.log()
  console.log(theme.success('  ✓ Settings saved.'))
  console.log()
}

async function providersMenu(projectRoot: string): Promise<void> {
  console.log()
  console.log(theme.dim('  Providers — configure API access'))
  console.log(
    theme.dim('  Keys are read from env vars or typed here (not stored in plain text)')
  )
  console.log()

  const { provider } = await Inq.prompt<{ provider: string }>([
    {
      type: 'list',
      name: 'provider',
      message: 'Which provider?',
      choices: [
        { name: `  Groq          ${envStatus('GROQ_API_KEY')}`, value: 'groq' },
        {
          name: `  Cerebras      ${envStatus('CEREBRAS_API_KEY')}`,
          value: 'cerebras',
        },
        {
          name: `  NVIDIA NIM    ${envStatus('NVIDIA_API_KEY')}`,
          value: 'nvidia',
        },
        new Inq.Separator(),
        { name: `  ← Back`, value: 'back' },
      ],
    },
  ])

  if (provider === 'back') return

  const providerModels: Record<string, string[]> = {
    groq: [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'mixtral-8x7b-32768',
    ],
    cerebras: ['llama-3.3-70b', 'llama-3.1-70b'],
    nvidia: [
      'meta/llama-3.3-70b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
    ],
  }

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: `  API Key for ${provider} (leave blank to keep env var):`,
    },
    {
      type: 'list',
      name: 'model',
      message: `  Default model:`,
      choices: providerModels[provider],
      default: providerModels[provider][0],
    },
    ...(provider === 'groq'
      ? [
          {
            type: 'number',
            name: 'maxConcurrency',
            message: '  Max concurrent calls (1–10):',
            default: 8,
            validate: (v: unknown) => {
              const num = Number(v)
              return num >= 1 && num <= 10 ? true : 'Must be between 1 and 10'
            },
          },
        ]
      : []),
    ...(provider === 'nvidia'
      ? [
          {
            type: 'input',
            name: 'baseUrl',
            message: '  Base URL (leave blank for default):',
            default: 'https://integrate.api.nvidia.com/v1',
          },
        ]
      : []),
  ])

  await writeConfigPatch(projectRoot, { providers: { [provider]: answers } })
  console.log(theme.success(`  ✓ ${provider} settings saved.`))
}

async function swarmMenu(projectRoot: string): Promise<void> {
  console.log()

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'primary',
      message: '  Primary provider (runs swarm agents):',
      choices: ['groq', 'cerebras', 'nvidia'],
      default: 'groq',
    },
    {
      type: 'list',
      name: 'synthesis',
      message: '  Synthesis provider (final report):',
      choices: ['cerebras', 'groq', 'nvidia'],
      default: 'cerebras',
    },
    {
      type: 'number',
      name: 'agentCount',
      message: '  Number of specialist agents (1–12):',
      default: 6,
      validate: (v: unknown) => {
        const num = Number(v)
        return num >= 1 && num <= 12 ? true : 'Must be between 1 and 12'
      },
    },
    {
      type: 'number',
      name: 'timeoutMs',
      message: '  Swarm timeout in milliseconds:',
      default: 120000,
    },
  ])

  await writeConfigPatch(projectRoot, { swarm: answers })
  console.log(theme.success('  ✓ Swarm settings saved.'))
}

async function outputMenu(projectRoot: string): Promise<void> {
  console.log()

  const { formats } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'formats',
      message: '  Output formats (select all that apply):',
      choices: [
        {
          name: 'HTML report (opens in browser)',
          value: 'html',
        },
        { name: 'JSON (machine-readable)', value: 'json' },
        { name: 'Markdown summary', value: 'md' },
      ],
      default: ['html', 'json'],
    },
  ])

  const rest = await inquirer.prompt([
    {
      type: 'input',
      name: 'dir',
      message: '  Report output directory:',
      default: '.palade/reports',
    },
    {
      type: 'confirm',
      name: 'openBrowser',
      message: '  Auto-open browser after review?',
      default: true,
    },
    {
      type: 'number',
      name: 'port',
      message: '  Local server port for HTML report:',
      default: 4242,
    },
  ])

  await writeConfigPatch(projectRoot, { output: { formats, ...rest } })
  console.log(theme.success('  ✓ Output settings saved.'))
}

async function scoreMenu(projectRoot: string): Promise<void> {
  console.log()

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'historyFile',
      message: '  Score history file path:',
      default: '.palade/history.json',
    },
    {
      type: 'confirm',
      name: 'badge',
      message: '  Generate README badge after each review?',
      default: true,
    },
    {
      type: 'input',
      name: 'badgePath',
      message: '  Badge output path:',
      default: 'palade-badge.svg',
    },
  ])

  await writeConfigPatch(projectRoot, { score: answers })
  console.log(theme.success('  ✓ Score settings saved.'))
}

async function ignoreMenu(projectRoot: string): Promise<void> {
  const ignorePath = join(projectRoot, '.paladeignore')
  let current = ''
  try {
    current = await readFile(ignorePath, 'utf-8')
  } catch {
    current = DEFAULT_IGNORE_CONTENT
  }

  console.log()
  console.log(theme.dim('  Current .paladeignore contents:'))
  console.log(theme.dim('  ──────────────────────────────'))
  current.split('\n').forEach((l) => console.log(theme.dim(`  ${l}`)))
  console.log()

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: '  What do you want to do?',
      choices: [
        { name: '  Add a pattern', value: 'add' },
        { name: '  Reset to defaults', value: 'reset' },
        { name: '  ← Back', value: 'back' },
      ],
    },
  ])

  if (action === 'back') return

  if (action === 'reset') {
    await writeFile(ignorePath, DEFAULT_IGNORE_CONTENT)
    console.log(theme.success('  ✓ .paladeignore reset to defaults.'))
    return
  }

  if (action === 'add') {
    const { pattern } = await inquirer.prompt([
      {
        type: 'input',
        name: 'pattern',
        message: '  Enter pattern to ignore (e.g. src/generated/):',
        validate: (v: unknown) => {
          const str = String(v)
          return str.trim().length > 0 ? true : 'Pattern cannot be empty'
        },
      },
    ])
    await appendFile(ignorePath, `\n${String(pattern).trim()}`)
    console.log(theme.success(`  ✓ Pattern added: ${String(pattern).trim()}`))
  }
}

function envStatus(envVar: string): string {
  return process.env[envVar]
    ? chalk.hex('#10B981')('● set')
    : chalk.hex('#EF4444')('○ not set')
}

async function writeConfigPatch(
  projectRoot: string,
  patch: Record<string, unknown>
): Promise<void> {
  const configPath = join(projectRoot, 'palade.config.ts')
  const newConfig = generateConfigString(patch)
  await writeFile(configPath, newConfig, 'utf-8')
}

function generateConfigString(patch: Record<string, unknown>): string {
  return `// palade.config.ts — managed by 'palade settings'
// Edit manually or run 'palade settings' to update

export default ${JSON.stringify(patch, null, 2)
    .replace(/"([^"]+)":/g, '$1:')
    .replace(/"/g, "'")}
`
}

const DEFAULT_IGNORE_CONTENT = `node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
`
