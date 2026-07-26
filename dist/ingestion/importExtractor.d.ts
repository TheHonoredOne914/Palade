/**
 * Extract raw import/require specifier strings from source code.
 *
 * Uses the TypeScript AST for .ts/.tsx/.js/.jsx/.mjs/.cjs files (the most
 * robust approach — avoids false positives from strings/comments that a
 * naive regex would match). Falls back to a regex scan for other languages,
 * or if AST parsing throws.
 *
 * Returns ALL specifiers (both relative/local and bare package imports),
 * deduplicated, in first-seen order.
 */
export declare function extractImportSpecifiers(content: string, filePath: string): string[];
