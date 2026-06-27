import ora, { type Ora } from 'ora'
import chalk from 'chalk'
import { theme } from './theme.js'

export interface LiveProgress {
  agentStart(name: string): void
  agentDone(name: string, findings: number, ms: number, error?: Error): void
  synthesisStart(providerName: string): void
  synthesisDone(ms: number): void
  stop(): void
}

export function createLiveProgress(): LiveProgress {
  if (process.env.PALADE_TUI) {
    return {
      agentStart(name) {
        console.log(`  ${theme.dim(name.padEnd(22))} ${theme.dim('running...')}`)
      },
      agentDone(name, findings, ms, err) {
        const time = `${(ms / 1000).toFixed(1)}s`
        if (err) {
          console.log(`  ${theme.error('✖')} ${theme.dim(name.padEnd(22))} ${theme.error('failed'.padEnd(20))} ${theme.dim(time)}`)
          return
        }
        const countStr =
          findings > 0
            ? theme.warning(`${findings} finding${findings !== 1 ? 's' : ''}`)
            : theme.success('clean')
        console.log(`  ${theme.success('✓')} ${theme.dim(name.padEnd(22))} ${countStr.padEnd(20)} ${theme.dim(time)}`)
      },
      synthesisStart(providerName) {
        console.log(`  ${theme.dim('Synthesis'.padEnd(22))} ${theme.dim(`${providerName}...`)}`)
      },
      synthesisDone(ms) {
        console.log(`  ${theme.primary('◆')} ${theme.dim('Synthesis'.padEnd(22))} ${theme.primary('complete')}                ${theme.dim((ms / 1000).toFixed(1) + 's')}`)
      },
      stop() {},
    }
  }

  const spinners = new Map<string, Ora>()

  return {
    agentStart(name) {
      const spinner = ora({
        text: `  ${theme.dim(name.padEnd(22))} ${theme.dim('initialising...')}`,
        spinner: 'dots2',
        color: 'magenta',
        prefixText: ' ',
      }).start()
      spinners.set(name, spinner)
    },

    agentDone(name, findings, ms, err) {
      const spinner = spinners.get(name)
      if (!spinner) return
      const time = `${(ms / 1000).toFixed(1)}s`
      
      if (err) {
        spinner.stopAndPersist({
          symbol: theme.error('✖'),
          text: `  ${theme.dim(name.padEnd(22))} ${theme.error('failed'.padEnd(20))} ${theme.dim(time)}`,
        })
        return
      }

      const countStr =
        findings > 0
          ? theme.warning(`${findings} finding${findings !== 1 ? 's' : ''}`)
          : theme.success('clean')
      spinner.stopAndPersist({
        symbol: theme.success('✓'),
        text: `  ${theme.dim(name.padEnd(22))} ${countStr.padEnd(20)} ${theme.dim(time)}`,
      })
    },

    synthesisStart(providerName) {
      const spinner = ora({
        text: `  ${theme.dim('Synthesis'.padEnd(22))} ${theme.dim(`${providerName}...`)}`,
        spinner: 'dots2',
        color: 'blue',
        prefixText: ' ',
      }).start()
      spinners.set('_synthesis', spinner)
    },

    synthesisDone(ms) {
      const spinner = spinners.get('_synthesis')
      if (!spinner) return
      spinner.stopAndPersist({
        symbol: theme.primary('◆'),
        text: `  ${theme.dim('Synthesis'.padEnd(22))} ${theme.primary('complete')}                ${theme.dim((ms / 1000).toFixed(1) + 's')}`,
      })
    },

    stop() {
      for (const s of spinners.values()) {
        if (s.isSpinning) s.stop()
      }
    },
  }
}
