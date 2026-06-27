import Table from 'cli-table3'
import { join } from 'node:path'
import { readHistory } from '../../scorer/history.js'
import { loadConfig } from '../../config/loader.js'
import { theme, scoreTheme } from '../../ui/theme.js'
import { sectionBox, kvTable, sparkline, scoreGrade, formatDelta } from '../../ui/layout.js'
import { CliExitError } from '../../errors/types.js'

export async function scoreCommand(opts: { history?: boolean }): Promise<void> {
  try {
    const config = await loadConfig()
    const historyPath = join(process.cwd(), config.score.historyFile)
    const entries = readHistory(historyPath)

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

    const table = new Table({
      head: [theme.primaryBold('Date'), theme.primaryBold('Score'), theme.primaryBold('Delta')],
      colWidths: [18, 12, 10],
      style: { head: [], border: ['grey'] },
    })

    for (const e of [...displayEntries].reverse()) {
      table.push([
        theme.dim(new Date(e.timestamp).toLocaleDateString()),
        scoreTheme(e.score)(`${e.score}/100`),
        e.delta !== null
          ? e.delta >= 0
            ? theme.success(`↑${e.delta}`)
            : theme.error(`↓${Math.abs(e.delta)}`)
          : theme.dim('—'),
      ])
    }

    console.log(table.toString())
    console.log()
  } catch (err) {
    console.error(theme.error(`Score lookup failed: ${(err as Error).message}`))
    throw new CliExitError(1)
  }
}
