import { join } from 'node:path'
import { readHistory } from '../../scorer/history.js'
import { loadConfig } from '../../config/loader.js'
import { theme, scoreTheme } from '../../ui/theme.js'
import { sectionBox, kvTable, sparkline, scoreGrade, formatDelta } from '../../ui/layout.js'
import { CliExitError } from '../../errors/types.js'

export async function scoreCommand(opts: {
  history?: boolean
  signal?: AbortSignal
}): Promise<void> {
  if (opts.signal?.aborted) throw new CliExitError(1)
  try {
    const config = await loadConfig()
    if (opts.signal?.aborted) throw new CliExitError(1)
    const historyPath = join(process.cwd(), config.score.historyFile)
    // Only 'full' (whole-repo `review`) entries feed the trend/sparkline —
    // changed-files-only `diff` scores aren't comparable and would skew it.
    const entries = readHistory(historyPath).filter((e) => e.kind !== 'diff')

    if (entries.length === 0) {
      console.log(theme.dim("  No score history. Run 'palade review' first."))
      return
    }

    const latest = entries[entries.length - 1]
    const scores = entries.map((h) => h.score)
    const spark = sparkline(scores)

    console.log()
    console.log(
      sectionBox(
        'Score History',
        [
          kvTable([
            [
              'Current score:',
              scoreTheme(latest.score)(
                `${latest.score}/100  ${formatDelta(latest.delta)}  Grade: ${scoreGrade(latest.score)}`
              ),
            ],
            ['Last review:', theme.dim(new Date(latest.timestamp).toLocaleDateString())],
            ['Run ID:', theme.dim(latest.runId)],
          ]),
          '',
          `  ${theme.dim('Trend:')}  ${spark}  ${theme.dim(`(${scores.length} run${scores.length !== 1 ? 's' : ''})`)}`,
        ].join('\n')
      )
    )

    // History table
    const displayEntries = opts.history ? entries : entries.slice(-10)

    const lines: string[] = []
    lines.push(
      `  ${theme.primaryBold('Date'.padEnd(18))} ${theme.primaryBold('Score'.padEnd(12))} ${theme.primaryBold('Delta')}`
    )
    lines.push(theme.dim('  ' + '─'.repeat(18 + 12 + 10)))

    for (const e of [...displayEntries].reverse()) {
      const dateStr = new Date(e.timestamp).toLocaleDateString().padEnd(18)
      const scoreStr = `${e.score}/100`.padEnd(12)
      const deltaStr =
        e.delta !== null
          ? e.delta >= 0
            ? theme.success(`↑${e.delta}`)
            : theme.error(`↓${Math.abs(e.delta)}`)
          : theme.dim('—')

      lines.push(`  ${theme.dim(dateStr)} ${scoreTheme(e.score)(scoreStr)} ${deltaStr}`)
    }

    console.log(lines.join('\n'))
    console.log()
  } catch (err) {
    if (err instanceof CliExitError) throw err
    console.error(theme.error(`Score lookup failed: ${(err as Error).message}`))
    throw new CliExitError(1)
  }
}
