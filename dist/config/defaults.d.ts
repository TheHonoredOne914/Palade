import type { PaladeConfig } from './schema.js';
export declare const DEFAULT_CONSTITUTION_PATH = ".palade/constitution.md";
export declare const DEFAULT_BADGE_PATH = "palade-badge.svg";
export declare const DEFAULT_SPEC_PATH = "palade.spec.md";
export declare const SEVERITY_PENALTY: {
    readonly critical: 10;
    readonly high: 5;
    readonly medium: 2;
    readonly low: 0.5;
    readonly info: 0;
};
export declare const DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS: {
    readonly critical: 15;
    readonly high: 8;
    readonly medium: 4;
};
export declare const DEFAULT_PENALTY_CAPS: {
    readonly categoryPenaltyCap: 90;
    readonly totalPenaltyCap: 95;
};
export declare const DEFAULT_COMPLEXITY_PENALTIES: {
    readonly lowThreshold: 5;
    readonly lowFactor: 0.5;
    readonly highThreshold: 20;
    readonly highFactor: 1.5;
};
type DefaultConfigType = Omit<Partial<PaladeConfig>, 'swarm'> & {
    swarm: Omit<PaladeConfig['swarm'], 'primary' | 'synthesis'>;
};
export declare const DEFAULT_CONFIG: DefaultConfigType;
export {};
