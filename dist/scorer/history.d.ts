import type { ScoreHistoryEntry } from './types.js';
/**
 * Parse+validate a raw history.json string into ScoreHistoryEntry[]. Shared
 * by readHistory() and git.ts's getBaseScore() so both apply the same
 * shape validation instead of git.ts trusting a raw type assertion.
 */
export declare function parseHistoryEntries(raw: string): ScoreHistoryEntry[];
export declare function readHistory(historyPath: string): ScoreHistoryEntry[];
export declare function writeHistory(historyPath: string, entries: ScoreHistoryEntry[], maxEntries?: number): boolean;
export declare function appendEntry(historyPath: string, entry: ScoreHistoryEntry, maxEntries?: number): Promise<ScoreHistoryEntry[]>;
export declare function getPreviousScore(historyPath: string): number | null;
