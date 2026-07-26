import type { ReporterContext, ReporterOutput } from './types.js';
import type { Severity } from '../agents/base.js';
interface AiConsumableBug {
    id: string;
    file: string | null;
    lineStart?: number;
    lineEnd?: number;
    severity: Severity;
    title: string;
    description: string;
    context: string[];
}
interface AiConsumableArchitectureIssue {
    title: string;
    description: string;
    affectedFiles: string[];
    severity: Severity;
}
interface AiConsumableReport {
    project: string;
    summary: string;
    bugs: AiConsumableBug[];
    architecturalIssues: AiConsumableArchitectureIssue[];
}
export declare function buildJsonReport(ctx: ReporterContext): AiConsumableReport;
export declare function reportJson(ctx: ReporterContext, outputPath: string): ReporterOutput;
export {};
