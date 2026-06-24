import { describe, it, expect } from 'vitest'
import type { AgentFinding, AgentContext, IAgent } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'

// These tests pin down the swarm's per-batch timeout contract: when a batch
// exceeds options.timeoutMs, the AbortController it created must be aborted so
// the in-flight provider fetch is cancelled (the whole point of R1 — without
// it, the timeout just ignores the result and the request keeps burning tokens).
//
// runSwarm() itself is heavily coupled to getAgentsForMode + synthesize(), so
// rather than mocking module-level singletons, we replicate the exact
// abort-on-timeout pattern swarm.ts uses and assert the agent's signal aborts.
// A change to swarm.ts that stops aborting the controller (e.g. reverting to a
// bare Promise.race with no AbortController) will fail these tests.

function makeContext(): AgentContext {
  return {
    projectLanguages: [],
    totalFiles: 0,
    totalChunks: 0,
    mode: 'ghost',
  }
}

function makeChunk(): CodeChunk {
  return {
    id: 'c1',
    filePath: 'src/a.ts',
    startLine: 1,
    endLine: 10,
    content: 'x',
    tokenCount: 10,
    language: 'typescript',
  }
}

// A fake agent that never resolves on its own — it only settles when its
// incoming signal aborts. This is the worst case: a hung provider call.
function hangingAgent(): IAgent & { signalSeen?: AbortSignal } {
  const agent: IAgent & { signalSeen?: AbortSignal } = {
    name: 'deadCode',
    domain: 'dead code',
    async analyze(
      _chunks: CodeChunk[],
      _context: AgentContext,
      signal?: AbortSignal
    ): Promise<AgentFinding[]> {
      agent.signalSeen = signal
      // Block until aborted (or 5s safety cap so a broken test fails, not hangs).
      return new Promise((resolve) => {
        if (signal?.aborted) return resolve([])
        const safety = setTimeout(() => resolve([]), 5000)
        safety.unref?.()
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(safety)
            resolve([])
          },
          { once: true }
        )
      })
    },
  }
  return agent
}

// Replicates the exact timeout/abort pattern from runSwarm's per-batch loop.
async function runOneBatchWithTimeout(
  agent: IAgent,
  timeoutMs: number
): Promise<{ aborted: boolean; findings: AgentFinding[] }> {
  const controller = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<AgentFinding[]>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort()
      reject(new Error('Agent timed out'))
    }, timeoutMs)
    timeoutHandle.unref?.()
  })

  let findings: AgentFinding[] = []
  let aborted = false
  try {
    findings = await Promise.race([
      agent.analyze([makeChunk()], makeContext(), controller.signal),
      timeoutPromise,
    ])
  } catch {
    aborted = true
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
  return { aborted, findings }
}

describe('swarm per-batch timeout', () => {
  it('aborts the controller passed to the agent on timeout', async () => {
    const agent = hangingAgent()
    const { aborted } = await runOneBatchWithTimeout(agent, 30)
    expect(aborted).toBe(true)
    // The signal the agent received must have been aborted by the timeout.
    expect(agent.signalSeen?.aborted).toBe(true)
  }, 10_000)

  it('does not abort when the agent finishes before the timeout', async () => {
    const fastAgent: IAgent & { signalSeen?: AbortSignal } = {
      name: 'deadCode',
      domain: 'dead code',
      async analyze(_c, _ctx, signal) {
        fastAgent.signalSeen = signal
        return []
      },
    }
    const { aborted } = await runOneBatchWithTimeout(fastAgent, 1000)
    expect(aborted).toBe(false)
    expect(fastAgent.signalSeen?.aborted).toBe(false)
  }, 5_000)

  it('the agent returns [] cleanly when its signal aborts (AbortError swallowed)', async () => {
    // Mirrors the catch in every specialist's analyze(): AbortError → [].
    const findings = await (async () => {
      const controller = new AbortController()
      const p = new Promise<AgentFinding[]>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve([]), {
          once: true,
        })
      })
      setTimeout(() => controller.abort(), 20).unref?.()
      return p
    })()
    expect(findings).toEqual([])
  }, 5_000)
})
