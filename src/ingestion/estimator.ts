import type { CodeChunk } from './types.js'
import type { PaladeConfig } from '../config/schema.js'
import { estimateTokens } from './chunker.js'
import { scheduleBatches } from '../orchestrator/scheduler.js'

export interface EstimateResult {
  totalChunks: number
  totalInputTokens: number
  agentCount: number
  totalAgentInvocations: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  estimatedCostUsd: Record<string, number | null>
  warningLevel: 'low' | 'medium' | 'high'
}

const PRICING_TABLE: Record<string, { input: number; output: number }> = {
  'opencode-zen:deepseek-v4-flash-free': { input: 0, output: 0 },
  'groq:llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }, // assuming default groq model
  'groq:llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'cerebras:llama3.1-8b': { input: 0.1, output: 0.1 },
  'cerebras:llama-3.3-70b': { input: 0.6, output: 0.6 },
  'cerebras:gpt-oss-120b': { input: 0.25, output: 0.69 },
  'openrouter:deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
  'openrouter:nvidia/nemotron-3-super-120b-a12b:free': { input: 0, output: 0 },
  'nvidia:minimaxai/minimax-m3': { input: 0.0, output: 0.0 }, // free tier example
  'ollama:': { input: 0, output: 0 },
}

function getProviderModelKey(providerName: string, providerConfig?: { model?: string }): string {
  if (providerName === 'ollama') return 'ollama:'
  if (providerName === 'opencode-zen')
    return `opencode-zen:${providerConfig?.model || 'deepseek-v4-flash-free'}`
  if (providerName === 'groq') return `groq:${providerConfig?.model || 'llama-3.3-70b-versatile'}`
  if (providerName === 'cerebras') return `cerebras:${providerConfig?.model || 'gpt-oss-120b'}`
  if (providerName === 'openrouter')
    return `openrouter:${providerConfig?.model || 'openrouter/free'}`
  if (providerName === 'nvidia') return `nvidia:${providerConfig?.model || 'minimaxai/minimax-m3'}`
  return `${providerName}:${providerConfig?.model || 'unknown'}`
}

export function estimateRunCost(
  chunks: CodeChunk[],
  config: PaladeConfig,
  customAgentCount = 0
): EstimateResult {
  const totalChunks = chunks.length

  // Reuse the shared chars/4 token estimation formula instead of
  // reimplementing it here (see chunker.ts's estimateTokens).
  const totalInputTokens = chunks.reduce((sum, chunk) => {
    return sum + estimateTokens(chunk.content)
  }, 0)

  const agentCount = (config.swarm.economyMode ? 1 : config.swarm.agentCount) + customAgentCount

  // The swarm doesn't send 1 LLM call per chunk per agent — scheduleBatches
  // groups chunks into batches first, and each agent makes one call per
  // batch (see orchestrator/swarm.ts). Derive the invocation count from the
  // real batching logic so the estimate isn't inflated relative to actual
  // cost.
  const totalBatches = scheduleBatches(chunks).length
  const totalAgentInvocations = totalBatches * agentCount

  // Assume ~400 output tokens per agent invocation
  const estimatedOutputTokens = totalAgentInvocations * 400
  const estimatedTotalTokens = totalInputTokens * agentCount + estimatedOutputTokens

  const primaryName = config.swarm.primary || 'opencode-zen'
  const synthesisName = config.swarm.synthesis || primaryName

  const primaryConfig = config.providers?.[primaryName as keyof PaladeConfig['providers']]
  const synthesisConfig = config.providers?.[synthesisName as keyof PaladeConfig['providers']]

  const primaryKey = getProviderModelKey(primaryName, primaryConfig)
  const synthesisKey = getProviderModelKey(synthesisName, synthesisConfig)

  const primaryPrice = PRICING_TABLE[primaryKey]
  const synthesisPrice = PRICING_TABLE[synthesisKey]

  let primaryCost: number | null = null
  if (primaryPrice) {
    primaryCost =
      ((totalInputTokens * agentCount) / 1_000_000) * primaryPrice.input +
      (estimatedOutputTokens / 1_000_000) * primaryPrice.output
  }

  // Synthesis reads the merged finding set, so its input size should track
  // how many findings the swarm can plausibly produce rather than a flat
  // guess — a big multi-agent run over hundreds of chunks generates far more
  // findings than a handful of chunks reviewed by one agent (ingest-009).
  // totalChunks*agentCount is a cheap proxy for that volume (every
  // chunk/agent pair is a potential finding source); scale roughly linearly
  // off it, clamped to a sane floor (matches the old flat guess for small
  // runs) and a ceiling (avoid absurd estimates on huge runs).
  const findingVolumeProxy = totalChunks * agentCount
  const synthesisInput = Math.min(60_000, Math.max(2000, Math.round(findingVolumeProxy * 30)))
  const synthesisOutput = Math.min(20_000, Math.max(1000, Math.round(findingVolumeProxy * 10)))
  let synthesisCost: number | null = null
  if (synthesisPrice) {
    synthesisCost =
      (synthesisInput / 1_000_000) * synthesisPrice.input +
      (synthesisOutput / 1_000_000) * synthesisPrice.output
  }

  const costMap: Record<string, number | null> = {}
  costMap[primaryName] = primaryCost
  if (synthesisName === primaryName) {
    // Merge independently computed costs — a known synthesis price should
    // never be discarded just because the primary price was unknown (or vice versa).
    if (primaryCost !== null || synthesisCost !== null) {
      costMap[synthesisName] = (primaryCost ?? 0) + (synthesisCost ?? 0)
    } else {
      costMap[synthesisName] = null
    }
  } else {
    costMap[synthesisName] = synthesisCost
  }

  let warningLevel: 'low' | 'medium' | 'high' = 'low'
  if (estimatedTotalTokens > 200_000) {
    warningLevel = 'high'
  } else if (estimatedTotalTokens > 50_000) {
    warningLevel = 'medium'
  }

  return {
    totalChunks,
    totalInputTokens,
    agentCount,
    totalAgentInvocations,
    estimatedOutputTokens,
    estimatedTotalTokens,
    estimatedCostUsd: costMap,
    warningLevel,
  }
}
