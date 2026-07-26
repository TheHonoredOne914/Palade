import type { ReporterContext, ReporterOutput } from './types.js';
export declare function writeHtmlReport(ctx: ReporterContext, outputPath: string): ReporterOutput;
export declare function startLocalServer(htmlPath: string, port?: number, options?: {
    openBrowser?: boolean;
}): void;
