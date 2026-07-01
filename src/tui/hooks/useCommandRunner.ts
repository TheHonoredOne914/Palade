import { useCallback } from 'react'
import { COMMAND_REGISTRY } from '../commands/registry.js'
import type { OutputLine } from '../components/OutputPane.js'
import type { PaladeConfig } from '../../config/schema.js'
import { reviewCommand } from '../../cli/commands/review.js'
import { diffCommand } from '../../cli/commands/diff.js'
import { watchCommand } from '../../cli/commands/watch.js'
import { scoreCommand } from '../../cli/commands/score.js'
import { initCommand } from '../../cli/commands/init.js'
import { targetsCommand } from '../../cli/commands/targets.js'

interface CommandRunnerOptions {
  config?: PaladeConfig
  projectRoot: string
  appendLine: (line: OutputLine) => void
  appendLines: (lines: OutputLine[]) => void
  clearOutput: () => void
  setStatus: (s: 'idle' | 'running') => void
  onExit: () => void
  onSettingsOpen?: () => void
  getAbortSignal?: () => AbortSignal | undefined
}

function printHelp(commandName: string | undefined, appendLines: (l: OutputLine[]) => void): void {
  if (commandName) {
    const cmd = COMMAND_REGISTRY.find((c) => c.name === commandName)
    if (!cmd) {
      appendLines([{ type: 'error', text: `No help for unknown command: /${commandName}` }])
      return
    }
    appendLines([
      { type: 'divider', text: '' },
      { type: 'output', text: `  /${cmd.name}  —  ${cmd.description}` },
      { type: 'dim', text: `  Usage:   ${cmd.usage}` },
      { type: 'dim', text: `  Examples:` },
      ...cmd.examples.map((e) => ({ type: 'dim' as const, text: `    ${e}` })),
      { type: 'divider', text: '' },
    ])
    return
  }

  appendLines([
    { type: 'divider', text: '' },
    { type: 'output', text: '  PALADE — Available Commands' },
    { type: 'divider', text: '' },
    ...COMMAND_REGISTRY.map((cmd) => ({
      type: 'output' as const,
      text: `  /${cmd.name.padEnd(14)} ${cmd.args ? (cmd.args + ' ').padEnd(28) : ''.padEnd(28)} ${cmd.description}`,
    })),
    { type: 'divider', text: '' },
    { type: 'dim', text: '  Type /help <command> for detailed usage.' },
    { type: 'dim', text: '  ↑↓ arrow keys navigate command history.' },
    { type: 'dim', text: '  Type / to see autocomplete suggestions.' },
    { type: 'divider', text: '' },
  ])
}

export function useCommandRunner(opts: CommandRunnerOptions) {
  const dispatch = useCallback(
    async (raw: string) => {
      if (!raw.startsWith('/')) {
        opts.appendLine({
          type: 'error',
          text: `Commands must start with /   Try /help`,
        })
        return
      }

      const parts = raw.slice(1).trim().split(/\s+/)
      const commandName = parts[0].toLowerCase()
      const rest = parts.slice(1)

      const known = COMMAND_REGISTRY.find((c) => c.name === commandName)
      if (!known) {
        opts.appendLine({ type: 'error', text: `Unknown command: /${commandName}` })
        opts.appendLine({
          type: 'dim',
          text: `Type /help to see available commands.`,
        })
        return
      }

      function flag(name: string): string | undefined {
        const idx = rest.indexOf(`--${name}`)
        if (idx === -1) return undefined
        const next = rest[idx + 1]
        // If next arg is another flag or doesn't exist, flag has no value
        if (!next || next.startsWith('--')) return undefined
        return next
      }
      function hasFlag(name: string): boolean {
        return rest.includes(`--${name}`)
      }
      const positional = rest.filter(
        (r, i) => !r.startsWith('--') && (i === 0 || !rest[i - 1]?.startsWith('--'))
      )

      opts.setStatus('running')

      try {
        switch (commandName) {
          case 'review': {
            const path = positional[0]
            await reviewCommand(path ?? undefined, {
              target: flag('target'),
              allTargets: hasFlag('all-targets'),
              dir: flag('dir'),
              file: positional.slice(1),
              glob: flag('glob'),
              mode: flag('mode') ?? 'standard',
              annotations: hasFlag('annotations'),
              pick: hasFlag('pick'),
              depth: flag('depth') ? parseInt(flag('depth')!, 10) || 1 : 1,
              format: flag('format'),
              open: hasFlag('no-open') ? false : hasFlag('open') ? true : undefined,
              quiet: true,
              tui: true,
              signal: opts.getAbortSignal?.(),
            })
            break
          }

          case 'diff': {
            await diffCommand({
              base: flag('base') ?? 'main',
              ci: hasFlag('ci'),
            })
            break
          }

          case 'watch': {
            opts.appendLines([
              { type: 'error', text: 'The watch daemon cannot be run inside the interactive TUI.' },
              {
                type: 'output',
                text: 'Please open a separate terminal window and run: palade watch',
              },
            ])
            break
          }

          case 'score': {
            await scoreCommand({ history: hasFlag('history') })
            break
          }

          case 'settings': {
            if (opts.onSettingsOpen) {
              opts.onSettingsOpen()
            } else {
              opts.appendLine({
                type: 'warn',
                text: '  Type /settings in the TUI to open settings.',
              })
            }
            break
          }

          case 'init': {
            await initCommand({ yes: hasFlag('yes') || hasFlag('y') })
            break
          }

          case 'targets': {
            const sub = positional[0]
            if (sub === 'search') {
              opts.appendLine({
                type: 'output',
                text: `Searching for "${positional[1] ?? ''}"...`,
              })
              await targetsCommand.parseAsync(['targets', 'search', positional[1] ?? ''])
            } else if (sub === 'add') {
              await targetsCommand.parseAsync(['targets', 'add', positional[1] ?? ''])
            } else {
              await targetsCommand.parseAsync(['targets', 'list'])
            }
            break
          }

          case 'clear': {
            opts.clearOutput()
            opts.setStatus('idle')
            return
          }

          case 'help': {
            printHelp(positional[0], opts.appendLines)
            break
          }

          case 'exit': {
            opts.appendLine({ type: 'dim', text: 'Goodbye.' })
            setTimeout(opts.onExit, 300)
            break
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        opts.appendLine({ type: 'error', text: msg })
      } finally {
        opts.setStatus('idle')
      }
    },
    [opts]
  )

  return { dispatch }
}
