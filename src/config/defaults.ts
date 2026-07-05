import { PaladeConfig } from './schema.js'

export const DEFAULT_CONFIG: Partial<PaladeConfig> = {
  swarm: {
    primary: 'opencode-zen',
    synthesis: 'nvidia',
    agentCount: 6,
    timeoutMs: 600000,
    maxReviewTokens: 200_000,
    economyMode: false,
    specPath: 'palade.spec.md',
    constitutionPath: '.palade/constitution.md',
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
    badgePath: 'palade-badge.svg',
    maxHistoryEntries: 50,
    severityWeights: {
      critical: 10,
      high: 5,
      medium: 2,
      low: 0.5,
      info: 0,
    },
    crossAgentPenalty: {
      critical: 15,
      high: 8,
      medium: 4,
    },
  },
}
