import { z } from 'zod';
export declare const CustomAgentDefinitionSchema: z.ZodObject<{
    /** Unique agent name. Must not collide with built-in names. */
    name: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    /** Display label for the agent's domain (e.g. "API Design", "Database Queries"). */
    domain: z.ZodString;
    /** System prompt template. Gets buildSystemPrompt context injection (diff, targets, annotations). */
    systemPrompt: z.ZodString;
    /** Optional per-severity score weight overrides. Falls back to SEVERITY_PENALTY. */
    severityPenalty: z.ZodOptional<z.ZodObject<{
        critical: z.ZodOptional<z.ZodNumber>;
        high: z.ZodOptional<z.ZodNumber>;
        medium: z.ZodOptional<z.ZodNumber>;
        low: z.ZodOptional<z.ZodNumber>;
        info: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        critical?: number | undefined;
        high?: number | undefined;
        medium?: number | undefined;
        low?: number | undefined;
        info?: number | undefined;
    }, {
        critical?: number | undefined;
        high?: number | undefined;
        medium?: number | undefined;
        low?: number | undefined;
        info?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    domain: string;
    systemPrompt: string;
    severityPenalty?: {
        critical?: number | undefined;
        high?: number | undefined;
        medium?: number | undefined;
        low?: number | undefined;
        info?: number | undefined;
    } | undefined;
}, {
    name: string;
    domain: string;
    systemPrompt: string;
    severityPenalty?: {
        critical?: number | undefined;
        high?: number | undefined;
        medium?: number | undefined;
        low?: number | undefined;
        info?: number | undefined;
    } | undefined;
}>;
export type CustomAgentDefinition = z.infer<typeof CustomAgentDefinitionSchema>;
