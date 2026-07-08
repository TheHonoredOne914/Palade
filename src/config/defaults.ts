import { PaladeConfig } from './schema.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import { DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS } from '../scorer/calculator.js'

export const DEFAULT_CONSTITUTION_PATH = '.palade/constitution.md'
export const DEFAULT_BADGE_PATH = 'palade-badge.svg'
export const DEFAULT_SPEC_PATH = 'palade.spec.md'

export const DEFAULT_CONFIG: Partial<PaladeConfig> = {
  swarm: {
    // primary/synthesis below are unreachable placeholders: loadConfig always
    // overwrites them with its auto-detected defaultPrimary/defaultSynthesis
    // (see src/config/loader.ts), regardless of the values set here.
    primary: 'opencode-zen',
    synthesis: 'nvidia',
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
  },
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
    complexityPenalties: {
      lowThreshold: 5,
      lowFactor: 0.5,
      highThreshold: 20,
      highFactor: 1.5,
    },
    penaltyCaps: { ...DEFAULT_PENALTY_CAPS },
  },
}
