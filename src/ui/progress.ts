import chalk from 'chalk'
import { theme } from './theme.js'

export interface LiveProgress {
  agentStart(name: string): void
  agentBatchDone(name: string, current: number, total: number, findings: number): void
  agentDone(name: string, findings: number, ms: number, error?: Error): void
  synthesisStart(providerName: string): void
  synthesisDone(ms: number): void
  stop(): void
}

export function createLiveProgress(): LiveProgress {
  return {
    agentStart(name) {
      console.log(`  ${theme.dim(name.padEnd(22))} ${theme.dim('running...')}`)
    },
    agentBatchDone(name, current, total, findings) {
      console.log(`  ${theme.dim(name.padEnd(22))} ${theme.dim(`batch ${current}/${total} complete (${findings} findings)`)}`)
    },
    agentDone(name, findings, ms, err) {
      const time = `${(ms / 1000).toFixed(1)}s`
      if (err) {
        console.log(
          `  ${theme.error('✖')} ${theme.dim(name.padEnd(22))} ${theme.error('failed'.padEnd(20))} ${theme.dim(time)}`
        )
        return
      }
      const countStr =
        findings > 0
          ? theme.warning(`${findings} finding${findings !== 1 ? 's' : ''}`)
          : theme.success('clean')
      console.log(
        `  ${theme.success('✓')} ${theme.dim(name.padEnd(22))} ${countStr.padEnd(20)} ${theme.dim(time)}`
      )
    },
    synthesisStart(providerName) {
      console.log(`  ${theme.dim('Synthesis'.padEnd(22))} ${theme.dim(`${providerName}...`)}`)
    },
    synthesisDone(ms) {
      console.log(
        `  ${theme.primary('◆')} ${theme.dim('Synthesis'.padEnd(22))} ${theme.primary('complete')}                ${theme.dim((ms / 1000).toFixed(1) + 's')}`
      )
    },
    stop() {},
  }
}
