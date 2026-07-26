export declare function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown>;
export declare function maskKey(key: string): string;
/** Redacts key-shaped substrings from free-form log text using maskKey(). */
export declare function sanitizeErrorMessage(text: string): string;
