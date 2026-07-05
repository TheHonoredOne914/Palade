import { useCallback } from 'react'
import { COMMAND_REGISTRY } from '../commands/registry.js'
import type { OutputLine } from '../components/OutputPane.js'
import type { PaladeConfig } from '../../config/schema.js'
import { reviewCommand } from '../../cli/commands/review.js'
import { diffCommand } from '../../cli/commands/diff.js'
import { watchCommand } from '../../cli/commands/watch.js'
import { scoreCommand } from '../../cli/commands/score.js'
import { initCommand } from '../../cli/commands/init.js'
import { decisionsCommand } from '../../cli/commands/decisions.js'
import {
  runTargetsSearch,
  runTargetsAdd,
  runTargetsGenerate,
  runTargetsList,
} from '../../cli/commands/targets.js'
import { CliExitError } from '../../errors/types.js'

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
      // Collects the value of every occurrence of a repeatable `--name value`
      // flag (e.g. multiple `--file <path>` pairs).
      function flagAll(name: string): string[] {
        const values: string[] = []
        rest.forEach((r, i) => {
          if (r === `--${name}`) {
            const next = rest[i + 1]
            if (next && !next.startsWith('--')) values.push(next)
          }
        })
        return values
      }
      // Only these flags consume a value. Excluding the token after ANY `--`
      // flag would swallow positionals following boolean flags (e.g.
      // `/review --pick src/foo.ts` losing its path).
      const VALUE_FLAGS = new Set([
        'target',
        'dir',
        'glob',
        'mode',
        'depth',
        'format',
        'base',
        'file',
        'days',
      ])
      const positional = rest.filter((r, i) => {
        if (r.startsWith('--')) return false
        const prev = rest[i - 1]
        return !(prev?.startsWith('--') && VALUE_FLAGS.has(prev.slice(2)))
      })

      // Capture this dispatch's abort signal so the finally block can tell
      // whether it is still the active command (a newer dispatch replaces the
      // controller) — otherwise an aborted command's late rejection resets the
      // status to idle while the NEXT command is still running.
      const runSignal = opts.getAbortSignal?.()

      opts.setStatus('running')

      try {
        switch (commandName) {
          case 'review': {
            const path = positional[0]
            await reviewCommand(path ?? undefined, {
              target: flag('target'),
              allTargets: hasFlag('all-targets'),
              dir: flag('dir'),
              file: flagAll('file'),
              glob: flag('glob'),
              mode: flag('mode') ?? 'standard',
              annotations: hasFlag('annotations'),
              pick: hasFlag('pick'),
              depth: flag('depth') ? parseInt(flag('depth')!, 10) || 1 : 1,
              format: flag('format'),
              open: hasFlag('no-open') ? false : hasFlag('open') ? true : undefined,
              quiet: false,
              tui: true,
              dryRun: hasFlag('dry-run'),
              economy: hasFlag('economy'),
              exhaustive: hasFlag('exhaustive'),
              strictTriage: hasFlag('strict-triage'),
              noVerdict: hasFlag('no-verdict'),
              signal: runSignal,
            })
            break
          }

          case 'diff': {
            await diffCommand({
              base: flag('base') ?? 'main',
              ci: hasFlag('ci'),
              signal: runSignal,
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
            await scoreCommand({ history: hasFlag('history'), signal: runSignal })
            break
          }

          case 'decisions': {
            const action = positional[0]
            const slug = positional[1]
            const days = flag('days')
            await decisionsCommand(action, slug, { days: days ? parseInt(days, 10) : undefined })
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
            await initCommand({ yes: hasFlag('yes') || hasFlag('y'), signal: runSignal })
            break
          }

          case 'targets': {
            const sub = positional[0]
            if (sub === 'search') {
              opts.appendLine({
                type: 'output',
                text: `Searching for "${positional[1] ?? ''}"...`,
              })
              await runTargetsSearch(positional[1] ?? '', runSignal)
            } else if (sub === 'add') {
              await runTargetsAdd(positional[1] ?? '', runSignal)
            } else if (sub === 'generate') {
              // The TUI tokenizer splits on whitespace, so re-join the query words
              await runTargetsGenerate(positional.slice(1).join(' '), runSignal)
            } else {
              await runTargetsList(runSignal)
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
        // A CliExitError with code 0 is an intentional "successful" early
        // exit (e.g. `diff` finding no changed files) — not a real failure,
        // so it shouldn't render as a trailing red error line.
        if (err instanceof CliExitError && err.exitCode === 0) {
          if (err.message) {
            opts.appendLine({ type: 'dim', text: err.message })
          }
        } else {
          const msg = err instanceof Error ? err.message : String(err)
          opts.appendLine({ type: 'error', text: msg })
        }
      } finally {
        const current = opts.getAbortSignal?.()
        if (runSignal === undefined || current === undefined || current === runSignal) {
          opts.setStatus('idle')
        }
      }
    },
    [opts]
  )

  return { dispatch }
}
