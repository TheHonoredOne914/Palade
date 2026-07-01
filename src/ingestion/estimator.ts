import type { CodeChunk } from './types.js'
import type { PaladeConfig } from '../config/schema.js'

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
  'cerebras:llama3.1-8b': { input: 0.10, output: 0.10 },
  'cerebras:llama-3.3-70b': { input: 0.60, output: 0.60 },
  'openrouter:deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
  'nvidia:minimaxai/minimax-m3': { input: 0.0, output: 0.0 }, // free tier example
  'ollama:': { input: 0, output: 0 },
}

function getProviderModelKey(providerName: string, providerConfig?: { model?: string }): string {
  if (providerName === 'ollama') return 'ollama:'
  if (providerName === 'opencode-zen') return `opencode-zen:${providerConfig?.model || 'deepseek-v4-flash-free'}`
  if (providerName === 'groq') return `groq:${providerConfig?.model || 'llama-3.3-70b-versatile'}`
  if (providerName === 'cerebras') return `cerebras:${providerConfig?.model || 'llama-3.3-70b'}`
  if (providerName === 'openrouter') return `openrouter:${providerConfig?.model || 'deepseek/deepseek-r1'}`
  if (providerName === 'nvidia') return `nvidia:${providerConfig?.model || 'minimaxai/minimax-m3'}`
  return `${providerName}:${providerConfig?.model || 'unknown'}`
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

  const primaryName = config.swarm.primary || 'opencode-zen'
  const synthesisName = config.swarm.synthesis || primaryName

  const primaryConfig = (config.providers as any)?.[primaryName]
  const synthesisConfig = (config.providers as any)?.[synthesisName]

  const primaryKey = getProviderModelKey(primaryName, primaryConfig)
  const synthesisKey = getProviderModelKey(synthesisName, synthesisConfig)

  const primaryPrice = PRICING_TABLE[primaryKey]
  const synthesisPrice = PRICING_TABLE[synthesisKey]

  const costMap: Record<string, number | null> = {}
  
  if (primaryPrice) {
    const cost = ((totalInputTokens * agentCount) / 1_000_000) * primaryPrice.input +
      (estimatedOutputTokens / 1_000_000) * primaryPrice.output
    costMap[primaryName] = (costMap[primaryName] || 0) + cost
  } else {
    costMap[primaryName] = null
  }

  // Synthesis takes findings as input, maybe 2000 tokens, output 1000
  const synthesisInput = 2000
  const synthesisOutput = 1000
  if (synthesisPrice) {
    const cost = (synthesisInput / 1_000_000) * synthesisPrice.input +
      (synthesisOutput / 1_000_000) * synthesisPrice.output
    if (costMap[synthesisName] !== null) {
      costMap[synthesisName] = (costMap[synthesisName] || 0) + cost
    }
  } else {
    costMap[synthesisName] = null
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
