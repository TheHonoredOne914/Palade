import { PaladeConfig } from './schema.js'

export const DEFAULT_CONFIG: Partial<PaladeConfig> = {
  swarm: {
    primary: 'opencode-zen',
    synthesis: 'nvidia',
    agentCount: 6,
    timeoutMs: 600000,
    maxReviewTokens: 200_000,
    economyMode: false,
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
  },
}
