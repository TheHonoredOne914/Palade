import type { ReporterContext, ReporterOutput } from './types.js';
export declare function buildMarkdownReport(ctx: ReporterContext): string;
export declare function reportMarkdown(ctx: ReporterContext, outputPath?: string): ReporterOutput;
