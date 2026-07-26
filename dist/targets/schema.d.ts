import { z } from 'zod';
export declare const TargetDefinitionSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    entry: z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>;
    focus: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    scope: z.ZodOptional<z.ZodObject<{
        dirs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        files: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        globs: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        annotationsOnly: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        dirs?: string[] | undefined;
        files?: string[] | undefined;
        globs?: string[] | undefined;
        annotationsOnly?: boolean | undefined;
    }, {
        dirs?: string[] | undefined;
        files?: string[] | undefined;
        globs?: string[] | undefined;
        annotationsOnly?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    entry: string | string[];
    focus?: string[] | undefined;
    scope?: {
        dirs?: string[] | undefined;
        files?: string[] | undefined;
        globs?: string[] | undefined;
        annotationsOnly?: boolean | undefined;
    } | undefined;
}, {
    name: string;
    description: string;
    entry: string | string[];
    focus?: string[] | undefined;
    scope?: {
        dirs?: string[] | undefined;
        files?: string[] | undefined;
        globs?: string[] | undefined;
        annotationsOnly?: boolean | undefined;
    } | undefined;
}>;
export type TargetDefinition = z.infer<typeof TargetDefinitionSchema>;
