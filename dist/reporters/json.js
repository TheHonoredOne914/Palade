import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
export function buildJsonReport(ctx) {
    return {
        project: ctx.config?.projectName ?? 'unknown-project',
        summary: ctx.synthesis.executiveSummary,
        bugs: ctx.findings.map((f) => ({
            id: f.id,
            file: f.filePath ?? null,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            severity: f.severity,
            title: f.title,
            description: f.description,
            context: f.tags ?? [],
        })),
        architecturalIssues: ctx.crossAgentFindings.map((f) => ({
            title: f.title,
            description: f.description,
            affectedFiles: f.filePaths,
            severity: f.severity,
        })),
    };
}
export function reportJson(ctx, outputPath) {
    const report = buildJsonReport(ctx);
    const content = JSON.stringify(report, null, 2);
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, content, 'utf-8');
    return {
        format: 'json',
        path: outputPath,
        content,
    };
}
