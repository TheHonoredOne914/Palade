import type { AgentName } from '../agents/base.js'
import type { ReviewMode } from '../agents/base.js'

export interface ModeConfig {
  mode: ReviewMode
  agentOverrides?: AgentName[]
  systemPromptSuffix: string
  synthesisPromptSuffix: string
  outputOverride?: string
}

import { SECURITY_MODE } from './security.js'
import { ONBOARD_MODE } from './onboard.js'
import { DEBT_MODE } from './debt.js'
import { GHOST_MODE } from './ghost.js'

const MODES: Record<ReviewMode, ModeConfig> = {
  standard: {
    mode: 'standard',
    systemPromptSuffix: '',
    synthesisPromptSuffix: '',
  },
  security: SECURITY_MODE,
  onboard: ONBOARD_MODE,
  debt: DEBT_MODE,
  ghost: GHOST_MODE,
}

export function getModeConfig(mode: ReviewMode): ModeConfig {
  return MODES[mode]
}

export function validateMode(raw: string): ReviewMode {
  const valid: ReviewMode[] = ['standard', 'security', 'onboard', 'debt', 'ghost']
  if (!valid.includes(raw as ReviewMode)) {
    throw new Error(
      `Invalid mode '${raw}'. Valid modes: ${valid.join(', ')}`
    )
  }
  return raw as ReviewMode
}
