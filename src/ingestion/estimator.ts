import type { CodeChunk } from './types.js'
import type { PaladeConfig } from '../config/schema.js'

export interface EstimateResult {
  totalChunks: number
  totalInputTokens: number
  agentCount: number
  totalAgentInvocations: number
  estimatedOutputTokens: number
  estimatedTotalTokens: number
  estimatedCostUsd: {
    groq: number
    openrouter: number
    cerebras: number
  }
  warningLevel: 'low' | 'medium' | 'high'
}

export function estimateRunCost(chunks: CodeChunk[], config: PaladeConfig): EstimateResult {
  const totalChunks = chunks.length

  // Approximate tokens: charCount / 4
  const totalInputTokens = chunks.reduce((sum, chunk) => {
    return sum + Math.ceil(chunk.content.length / 4)
  }, 0)

  const agentCount = config.swarm.economyMode ? 1 : config.swarm.agentCount
  const totalAgentInvocations = totalChunks * agentCount

  // Assume ~400 output tokens per agent invocation
  const estimatedOutputTokens = totalAgentInvocations * 400
  const estimatedTotalTokens = totalInputTokens * agentCount + estimatedOutputTokens

  // Pricing constants (estimates as of mid-2025)
  // Groq (llama-3.3-70b): $0.59 / 1M input, $0.79 / 1M output
  // OpenRouter (deepseek-r1): $0.55 / 1M input, $2.19 / 1M output
  // Cerebras (llama-3.3-70b): $0.60 / 1M input, $0.60 / 1M output

  const costGroq =
    ((totalInputTokens * agentCount) / 1_000_000) * 0.59 +
    (estimatedOutputTokens / 1_000_000) * 0.79
  const costOpenrouter =
    ((totalInputTokens * agentCount) / 1_000_000) * 0.55 +
    (estimatedOutputTokens / 1_000_000) * 2.19
  const costCerebras =
    ((totalInputTokens * agentCount) / 1_000_000) * 0.6 + (estimatedOutputTokens / 1_000_000) * 0.6

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
    estimatedCostUsd: {
      groq: costGroq,
      openrouter: costOpenrouter,
      cerebras: costCerebras,
    },
    warningLevel,
  }
}
