import { z } from 'zod';
export declare const ReportFormatSchema: z.ZodEnum<["html", "json", "md"]>;
export declare const PaladeConfigSchema: z.ZodObject<{
    providers: z.ZodObject<{
        groq: z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
        cerebras: z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
        nvidia: z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
        openrouter: z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
        'opencode-zen': z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
        ollama: z.ZodOptional<z.ZodObject<{
            apiKey: z.ZodDefault<z.ZodString>;
            apiKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            model: z.ZodOptional<z.ZodString>;
            maxConcurrency: z.ZodOptional<z.ZodNumber>;
            baseUrl: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
            referer: z.ZodOptional<z.ZodString>;
            title: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }, {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        groq?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        cerebras?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        nvidia?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        openrouter?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        'opencode-zen'?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        ollama?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
    }, {
        groq?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        cerebras?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        nvidia?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        openrouter?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        'opencode-zen'?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        ollama?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
    }>;
    swarm: z.ZodDefault<z.ZodObject<{
        primary: z.ZodDefault<z.ZodEnum<["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"]>>;
        synthesis: z.ZodDefault<z.ZodEnum<["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"]>>;
        triage: z.ZodOptional<z.ZodEnum<["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"]>>;
        agentProviders: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"]>>>;
        providerShares: z.ZodOptional<z.ZodRecord<z.ZodEnum<["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"]>, z.ZodNumber>>;
        agentCount: z.ZodDefault<z.ZodNumber>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        maxReviewTokens: z.ZodDefault<z.ZodNumber>;
        economyMode: z.ZodDefault<z.ZodBoolean>;
        includeSkills: z.ZodDefault<z.ZodBoolean>;
        specPath: z.ZodDefault<z.ZodString>;
        constitutionPath: z.ZodDefault<z.ZodString>;
        maxConcurrentBatches: z.ZodDefault<z.ZodNumber>;
        softTokenLimit: z.ZodDefault<z.ZodNumber>;
        hardChunkLimit: z.ZodDefault<z.ZodNumber>;
        maxSynthesisFindings: z.ZodDefault<z.ZodNumber>;
        synthesisTimeoutMs: z.ZodDefault<z.ZodNumber>;
        decisionsRetentionLimit: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        primary: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama";
        synthesis: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama";
        timeoutMs: number;
        agentCount: number;
        maxReviewTokens: number;
        economyMode: boolean;
        includeSkills: boolean;
        specPath: string;
        constitutionPath: string;
        maxConcurrentBatches: number;
        softTokenLimit: number;
        hardChunkLimit: number;
        maxSynthesisFindings: number;
        synthesisTimeoutMs: number;
        decisionsRetentionLimit: number;
        triage?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        agentProviders?: Record<string, "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama"> | undefined;
        providerShares?: Partial<Record<"groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama", number>> | undefined;
    }, {
        primary?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        synthesis?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        triage?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        timeoutMs?: number | undefined;
        agentProviders?: Record<string, "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama"> | undefined;
        providerShares?: Partial<Record<"groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama", number>> | undefined;
        agentCount?: number | undefined;
        maxReviewTokens?: number | undefined;
        economyMode?: boolean | undefined;
        includeSkills?: boolean | undefined;
        specPath?: string | undefined;
        constitutionPath?: string | undefined;
        maxConcurrentBatches?: number | undefined;
        softTokenLimit?: number | undefined;
        hardChunkLimit?: number | undefined;
        maxSynthesisFindings?: number | undefined;
        synthesisTimeoutMs?: number | undefined;
        decisionsRetentionLimit?: number | undefined;
    }>>;
    output: z.ZodDefault<z.ZodObject<{
        dir: z.ZodDefault<z.ZodString>;
        formats: z.ZodDefault<z.ZodArray<z.ZodEnum<["html", "json", "md"]>, "many">>;
        openBrowser: z.ZodDefault<z.ZodBoolean>;
        port: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        dir: string;
        formats: ("html" | "json" | "md")[];
        openBrowser: boolean;
        port: number;
    }, {
        dir?: string | undefined;
        formats?: ("html" | "json" | "md")[] | undefined;
        openBrowser?: boolean | undefined;
        port?: number | undefined;
    }>>;
    score: z.ZodDefault<z.ZodObject<{
        historyFile: z.ZodDefault<z.ZodString>;
        badge: z.ZodDefault<z.ZodBoolean>;
        badgePath: z.ZodDefault<z.ZodString>;
        maxHistoryEntries: z.ZodDefault<z.ZodNumber>;
        severityWeights: z.ZodDefault<z.ZodObject<{
            critical: z.ZodDefault<z.ZodNumber>;
            high: z.ZodDefault<z.ZodNumber>;
            medium: z.ZodDefault<z.ZodNumber>;
            low: z.ZodDefault<z.ZodNumber>;
            info: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        }, {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            info?: number | undefined;
        }>>;
        crossAgentPenalty: z.ZodDefault<z.ZodObject<{
            critical: z.ZodDefault<z.ZodNumber>;
            high: z.ZodDefault<z.ZodNumber>;
            medium: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            critical: number;
            high: number;
            medium: number;
        }, {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
        }>>;
        complexityPenalties: z.ZodDefault<z.ZodEffects<z.ZodObject<{
            lowThreshold: z.ZodDefault<z.ZodNumber>;
            lowFactor: z.ZodDefault<z.ZodNumber>;
            highThreshold: z.ZodDefault<z.ZodNumber>;
            highFactor: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            lowThreshold: number;
            lowFactor: number;
            highThreshold: number;
            highFactor: number;
        }, {
            lowThreshold?: number | undefined;
            lowFactor?: number | undefined;
            highThreshold?: number | undefined;
            highFactor?: number | undefined;
        }>, {
            lowThreshold: number;
            lowFactor: number;
            highThreshold: number;
            highFactor: number;
        }, {
            lowThreshold?: number | undefined;
            lowFactor?: number | undefined;
            highThreshold?: number | undefined;
            highFactor?: number | undefined;
        }>>;
        penaltyCaps: z.ZodDefault<z.ZodObject<{
            categoryPenaltyCap: z.ZodDefault<z.ZodNumber>;
            totalPenaltyCap: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            categoryPenaltyCap: number;
            totalPenaltyCap: number;
        }, {
            categoryPenaltyCap?: number | undefined;
            totalPenaltyCap?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        historyFile: string;
        badge: boolean;
        badgePath: string;
        maxHistoryEntries: number;
        severityWeights: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
        crossAgentPenalty: {
            critical: number;
            high: number;
            medium: number;
        };
        complexityPenalties: {
            lowThreshold: number;
            lowFactor: number;
            highThreshold: number;
            highFactor: number;
        };
        penaltyCaps: {
            categoryPenaltyCap: number;
            totalPenaltyCap: number;
        };
    }, {
        historyFile?: string | undefined;
        badge?: boolean | undefined;
        badgePath?: string | undefined;
        maxHistoryEntries?: number | undefined;
        severityWeights?: {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            info?: number | undefined;
        } | undefined;
        crossAgentPenalty?: {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
        } | undefined;
        complexityPenalties?: {
            lowThreshold?: number | undefined;
            lowFactor?: number | undefined;
            highThreshold?: number | undefined;
            highFactor?: number | undefined;
        } | undefined;
        penaltyCaps?: {
            categoryPenaltyCap?: number | undefined;
            totalPenaltyCap?: number | undefined;
        } | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    providers: {
        groq?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        cerebras?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        nvidia?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        openrouter?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        'opencode-zen'?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        ollama?: {
            apiKey: string;
            model?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
    };
    swarm: {
        primary: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama";
        synthesis: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama";
        timeoutMs: number;
        agentCount: number;
        maxReviewTokens: number;
        economyMode: boolean;
        includeSkills: boolean;
        specPath: string;
        constitutionPath: string;
        maxConcurrentBatches: number;
        softTokenLimit: number;
        hardChunkLimit: number;
        maxSynthesisFindings: number;
        synthesisTimeoutMs: number;
        decisionsRetentionLimit: number;
        triage?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        agentProviders?: Record<string, "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama"> | undefined;
        providerShares?: Partial<Record<"groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama", number>> | undefined;
    };
    output: {
        dir: string;
        formats: ("html" | "json" | "md")[];
        openBrowser: boolean;
        port: number;
    };
    score: {
        historyFile: string;
        badge: boolean;
        badgePath: string;
        maxHistoryEntries: number;
        severityWeights: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
        crossAgentPenalty: {
            critical: number;
            high: number;
            medium: number;
        };
        complexityPenalties: {
            lowThreshold: number;
            lowFactor: number;
            highThreshold: number;
            highFactor: number;
        };
        penaltyCaps: {
            categoryPenaltyCap: number;
            totalPenaltyCap: number;
        };
    };
}, {
    providers: {
        groq?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        cerebras?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        nvidia?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        openrouter?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        'opencode-zen'?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
        ollama?: {
            model?: string | undefined;
            apiKey?: string | undefined;
            apiKeys?: string[] | undefined;
            maxConcurrency?: number | undefined;
            baseUrl?: string | undefined;
            timeoutMs?: number | undefined;
            referer?: string | undefined;
            title?: string | undefined;
        } | undefined;
    };
    swarm?: {
        primary?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        synthesis?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        triage?: "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama" | undefined;
        timeoutMs?: number | undefined;
        agentProviders?: Record<string, "groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama"> | undefined;
        providerShares?: Partial<Record<"groq" | "cerebras" | "nvidia" | "openrouter" | "opencode-zen" | "ollama", number>> | undefined;
        agentCount?: number | undefined;
        maxReviewTokens?: number | undefined;
        economyMode?: boolean | undefined;
        includeSkills?: boolean | undefined;
        specPath?: string | undefined;
        constitutionPath?: string | undefined;
        maxConcurrentBatches?: number | undefined;
        softTokenLimit?: number | undefined;
        hardChunkLimit?: number | undefined;
        maxSynthesisFindings?: number | undefined;
        synthesisTimeoutMs?: number | undefined;
        decisionsRetentionLimit?: number | undefined;
    } | undefined;
    output?: {
        dir?: string | undefined;
        formats?: ("html" | "json" | "md")[] | undefined;
        openBrowser?: boolean | undefined;
        port?: number | undefined;
    } | undefined;
    score?: {
        historyFile?: string | undefined;
        badge?: boolean | undefined;
        badgePath?: string | undefined;
        maxHistoryEntries?: number | undefined;
        severityWeights?: {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
            low?: number | undefined;
            info?: number | undefined;
        } | undefined;
        crossAgentPenalty?: {
            critical?: number | undefined;
            high?: number | undefined;
            medium?: number | undefined;
        } | undefined;
        complexityPenalties?: {
            lowThreshold?: number | undefined;
            lowFactor?: number | undefined;
            highThreshold?: number | undefined;
            highFactor?: number | undefined;
        } | undefined;
        penaltyCaps?: {
            categoryPenaltyCap?: number | undefined;
            totalPenaltyCap?: number | undefined;
        } | undefined;
    } | undefined;
}>;
export type PaladeConfig = z.infer<typeof PaladeConfigSchema>;
