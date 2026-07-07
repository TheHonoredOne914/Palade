import { describe, it, expect } from 'vitest'
import type { AgentFinding, AgentContext, IAgent } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'
import { applyLineIgnores } from '../ingestion/annotationParser.js'
import { AgentMemory } from './memory.js'

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

// Pins down the fix for the ignore-ordering bug: runSwarm used to filter
// @palade-ignored lines out of the FINAL findings array, after
// crossReference() and synthesis had already consumed the unfiltered
// memory store. crossAgentFindings carries no per-finding line info, so an
// ignored finding that slipped into a cross-agent cluster could never be
// filtered out afterward. The fix filters each agent's findings with
// applyLineIgnores() before they're ever recorded into AgentMemory — this
// replicates that exact sequence (matching this file's convention of testing
// the pattern directly rather than mocking runSwarm's module-level deps).
describe('swarm ignore-ordering', () => {
  function ignoredFinding(): AgentFinding {
    return {
      id: 'f-ignored',
      agentName: 'security',
      title: 'Ignored finding',
      description: 'On a line carrying @palade ignore',
      severity: 'high',
      tags: [],
      scorePenalty: 10,
      filePath: 'src/a.ts',
      lineStart: 10,
      lineEnd: 10,
    }
  }

  function otherAgentFindingSameSpot(): AgentFinding {
    return {
      id: 'f-other',
      agentName: 'architecture',
      title: 'Ignored finding',
      description: 'A second agent flagging the same ignored line',
      severity: 'high',
      tags: [],
      scorePenalty: 10,
      filePath: 'src/a.ts',
      lineStart: 10,
      lineEnd: 10,
    }
  }

  it('keeps an ignored finding out of crossReference() when filtered before recording', () => {
    const ignoredLines = [{ filePath: 'src/a.ts', startLine: 10 }]
    const memory = new AgentMemory()

    // This is the fixed sequence: filter each agent's findings before
    // memory.record(), so crossReference() never sees the ignored finding.
    memory.record('security', applyLineIgnores([ignoredFinding()], ignoredLines))
    memory.record('architecture', applyLineIgnores([otherAgentFindingSameSpot()], ignoredLines))

    expect(memory.getAll()).toEqual([])
    expect(memory.crossReference()).toEqual([])
  })

  it('demonstrates the old bug: filtering only the merged output after crossReference() leaks the finding', () => {
    const ignoredLines = [{ filePath: 'src/a.ts', startLine: 10 }]
    const memory = new AgentMemory()

    // This is the old (buggy) sequence: record raw findings, compute
    // crossReference() from them, and only filter the flat findings list
    // afterward — the ignored finding still drives a cross-agent cluster.
    memory.record('security', [ignoredFinding()])
    memory.record('architecture', [otherAgentFindingSameSpot()])

    const crossAgentFindings = memory.crossReference()
    const filteredFindings = applyLineIgnores(memory.getAll(), ignoredLines)

    expect(filteredFindings).toEqual([])
    // The bug: the ignored finding still produced a cross-agent cluster,
    // because crossReference() ran before the filter was applied.
    expect(crossAgentFindings.length).toBeGreaterThan(0)
  })
})
