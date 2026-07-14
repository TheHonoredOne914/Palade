import type { PaladeConfig } from './schema.js'

export const DEFAULT_CONSTITUTION_PATH = '.palade/constitution.md'
export const DEFAULT_BADGE_PATH = 'palade-badge.svg'
export const DEFAULT_SPEC_PATH = 'palade.spec.md'

export const SEVERITY_PENALTY = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0,
} as const

export const DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS = {
  critical: 15,
  high: 8,
  medium: 4,
} as const

export const DEFAULT_PENALTY_CAPS = {
  categoryPenaltyCap: 90,
  totalPenaltyCap: 95,
} as const

export const DEFAULT_COMPLEXITY_PENALTIES = {
  lowThreshold: 5,
  lowFactor: 0.5,
  highThreshold: 20,
  highFactor: 1.5,
} as const

export const DEFAULT_CONFIG: Partial<PaladeConfig> = {
  swarm: {
    agentCount: 8,
    timeoutMs: 600000,
    maxReviewTokens: 200_000,
    economyMode: false,
    includeSkills: true,
    specPath: DEFAULT_SPEC_PATH,
    constitutionPath: DEFAULT_CONSTITUTION_PATH,
    maxConcurrentBatches: 5,
    softTokenLimit: 16000,
    hardChunkLimit: 6000,
    maxSynthesisFindings: 50,
    synthesisTimeoutMs: 180_000,
    decisionsRetentionLimit: 100,
  } as unknown as PaladeConfig['swarm'],
  output: {
    dir: '.palade/reports',
    formats: ['html', 'json'],
    openBrowser: true,
    port: 4242,
  },
  score: {
    historyFile: '.palade/history.json',
    badge: true,
    badgePath: DEFAULT_BADGE_PATH,
    maxHistoryEntries: 50,
    severityWeights: { ...SEVERITY_PENALTY },
    crossAgentPenalty: { ...DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS },
    complexityPenalties: { ...DEFAULT_COMPLEXITY_PENALTIES },
    penaltyCaps: { ...DEFAULT_PENALTY_CAPS },
  },
}
