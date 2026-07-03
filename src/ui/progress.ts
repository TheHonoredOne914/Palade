import chalk from 'chalk'
import { theme } from './theme.js'

export interface LiveProgress {
  agentStart(name: string): void
  agentBatchDone(name: string, current: number, total: number, findings: number): void
  agentDone(name: string, findings: number, ms: number, error?: Error): void
  conflictDetected(file: string, sideA: string, sideB: string): void
  verdictDecided(decision: string, confidence: number): void
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
      console.log(
        `  ${theme.dim(name.padEnd(22))} ${theme.dim(`batch ${current}/${total} complete (${findings} findings)`)}`
      )
    },
    agentDone(name, findings, ms, err) {
      const time = `${(ms / 1000).toFixed(1)}s`
      if (err) {
        console.log(
          `  ${theme.error('✖')} ${theme.dim(name.padEnd(22))} ${theme.error('failed'.padEnd(20))} ${theme.dim(time)}`
        )
        return
      }
      const countRaw = findings > 0 ? `${findings} finding${findings !== 1 ? 's' : ''}` : 'clean'
      const countStr =
        findings > 0 ? theme.warning(countRaw.padEnd(20)) : theme.success(countRaw.padEnd(20))
      console.log(
        `  ${theme.success('✓')} ${theme.dim(name.padEnd(22))} ${countStr} ${theme.dim(time)}`
      )
    },
    conflictDetected(file, sideA, sideB) {
      console.log(`\n  ${theme.warning('⚠ CONFLICT')}  ${theme.white(file)}`)
      console.log(`  ${theme.dim(`[${sideA}] vs [${sideB}]`)}`)
      console.log(`  ${theme.dim('⚖ Arbitrating...')}`)
    },
    verdictDecided(decision, confidence) {
      console.log(
        `  ${theme.primary('[VERDICT]')}   ${decision} ${theme.dim(`(Confidence: ${confidence}%)`)}\n`
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
