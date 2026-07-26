import type { AgentName } from '../agents/base.js';
export type ScoreCategory = AgentName;
export interface CategoryScore {
    category: ScoreCategory;
    score: number;
    findingCount: number;
    criticalCount: number;
    highCount: number;
}
export interface ScoreBreakdown {
    total: number;
    categories: CategoryScore[];
    findingCount: number;
    crossAgentCount: number;
}
export interface ScoreResult {
    score: number;
    breakdown: ScoreBreakdown;
    previousScore: number | null;
    delta: number;
}
export interface ScoreHistoryEntry {
    timestamp: string;
    runId: string;
    score: number;
    breakdown: ScoreBreakdown;
    delta: number;
    kind?: 'full' | 'diff';
}
export type BadgeColor = 'brightgreen' | 'green' | 'yellow' | 'orange' | 'red';
export interface BadgeData {
    score: number | string;
    color: BadgeColor;
    label: string;
}
export declare const CATEGORY_LABELS: Record<string, string>;
