import type { ChangedFile } from './types.js';
export declare function isGitRepo(cwd: string): Promise<boolean>;
export declare function getCurrentBranch(cwd: string): Promise<string>;
export declare function getChangedFiles(baseBranch: string, cwd: string): Promise<ChangedFile[]>;
export declare function getMergeBase(baseBranch: string, cwd: string): Promise<string | null>;
/**
 * Read a file's content as it existed at a given ref (commit-ish). Returns
 * null if the file didn't exist at that ref (e.g. it was added after the
 * base branch diverged) or the read otherwise fails (binary blob, etc.).
 */
export declare function getFileContentAtRef(ref: string, filePath: string, cwd: string): string | null;
export declare function getBaseScore(baseBranch: string, historyFile: string, cwd: string): Promise<number | null>;
