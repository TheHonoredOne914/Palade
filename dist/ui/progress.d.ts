export interface LiveProgress {
    agentStart(name: string): void;
    agentBatchDone(name: string, current: number, total: number, findings: number): void;
    agentDone(name: string, findings: number, ms: number, error?: Error): void;
    conflictDetected(file: string, sideA: string, sideB: string): void;
    verdictDecided(decision: string, confidence: number): void;
    synthesisStart(providerName: string): void;
    synthesisDone(ms: number): void;
    stop(): void;
}
export declare function createLiveProgress(): LiveProgress;
