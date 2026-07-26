import type { AgentFinding } from '../agents/base.js';
export declare function sectionBox(title: string, content: string): string;
export declare function formatDriftAlert(filePath: string, findings: AgentFinding[]): string;
export declare function kvTable(rows: [string, string][]): string;
export declare function sparkline(values: number[], width?: number): string;
export declare function scoreGrade(score: number): string;
export declare function formatDelta(delta: number): string;
