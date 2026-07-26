import { SECURITY_MODE } from './security.js';
import { ONBOARD_MODE } from './onboard.js';
import { DEBT_MODE } from './debt.js';
import { GHOST_MODE } from './ghost.js';
const MODES = {
    standard: {
        mode: 'standard',
        systemPromptSuffix: '',
        synthesisPromptSuffix: '',
    },
    security: SECURITY_MODE,
    onboard: ONBOARD_MODE,
    debt: DEBT_MODE,
    ghost: GHOST_MODE,
};
export function getModeConfig(mode) {
    return MODES[mode];
}
export function validateMode(raw) {
    const valid = ['standard', 'security', 'onboard', 'debt', 'ghost'];
    if (!valid.includes(raw)) {
        throw new Error(`Invalid mode '${raw}'. Valid modes: ${valid.join(', ')}`);
    }
    return raw;
}
