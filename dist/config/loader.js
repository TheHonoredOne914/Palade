import chalk from 'chalk';
import { readFileSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { pathToFileURL } from 'node:url';
import { PaladeConfigSchema } from './schema.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { PaladeConfigError } from '../errors/types.js';
import { BUILTIN_NAMES } from '../agents/registry.js';
import { PROVIDER_NAMES } from '../providers/router.js';
dotenvConfig();
export function readPackageJson(projectRoot) {
    try {
        const content = readFileSync(join(projectRoot, 'package.json'), 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function collectKeys(prefix) {
    const keys = [];
    const single = process.env[`${prefix}_API_KEY`];
    if (single)
        keys.push(single);
    for (let i = 1; i <= 20; i++) {
        const val = process.env[`${prefix}_API_KEY_${i}`];
        if (val)
            keys.push(val);
    }
    return keys;
}
function buildEnvConfig() {
    const providers = {};
    const groqKeys = collectKeys('GROQ');
    if (groqKeys.length > 0) {
        providers.groq = { apiKey: groqKeys[0], apiKeys: groqKeys.length > 1 ? groqKeys : undefined };
    }
    const cerebrasKeys = collectKeys('CEREBRAS');
    if (cerebrasKeys.length > 0) {
        providers.cerebras = {
            apiKey: cerebrasKeys[0],
            apiKeys: cerebrasKeys.length > 1 ? cerebrasKeys : undefined,
        };
    }
    const nvidiaKeys = collectKeys('NVIDIA');
    if (nvidiaKeys.length > 0) {
        providers.nvidia = {
            apiKey: nvidiaKeys[0],
            apiKeys: nvidiaKeys.length > 1 ? nvidiaKeys : undefined,
        };
    }
    const openrouterKeys = collectKeys('OPENROUTER');
    if (openrouterKeys.length > 0) {
        providers.openrouter = {
            apiKey: openrouterKeys[0],
            apiKeys: openrouterKeys.length > 1 ? openrouterKeys : undefined,
        };
    }
    const opencodeZenKeys = collectKeys('OPENCODE_ZEN');
    if (opencodeZenKeys.length > 0) {
        providers['opencode-zen'] = {
            apiKey: opencodeZenKeys[0],
            apiKeys: opencodeZenKeys.length > 1 ? opencodeZenKeys : undefined,
        };
    }
    const ollamaModel = process.env.OLLAMA_MODEL;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
    if (ollamaModel || ollamaBaseUrl) {
        providers['ollama'] = {
            apiKey: 'local', // fake key to pass validations if needed
            model: ollamaModel,
            baseUrl: ollamaBaseUrl,
        };
    }
    return {
        providers: providers,
    };
}
/**
 * Expand a declarative provider-share map ({ 'opencode-zen': 5, openrouter: 3 })
 * into per-agent agentProviders entries. Shares are consumed in the map's
 * insertion order, assigned over the active agents in registry priority order
 * (BUILTIN_NAMES prefix of agentCount) by default. Shares beyond the agent
 * list length are ignored; agents left without a share get no entry and fall
 * through to swarm.primary.
 *
 * `agentNames`, when given, overrides the BUILTIN_NAMES/agentCount-derived
 * list entirely. This config-load-time call has no idea what review mode
 * will run (modes with agentOverrides — onboard, ghost — dispatch a
 * completely different, fixed agent list that ignores agentCount), so a
 * caller that DOES know the actual resolved agent list (e.g. swarm.ts, once
 * getAgentsForMode() has run) can re-expand shares against the real
 * dispatched agents instead of the standard-mode assumption baked in here
 * (providers-002).
 */
export function expandProviderShares(shares, agentCount, agentNames) {
    const agents = agentNames ?? BUILTIN_NAMES.slice(0, agentCount);
    const expanded = {};
    let i = 0;
    for (const [provider, count] of Object.entries(shares)) {
        for (let n = 0; n < count && i < agents.length; n++) {
            expanded[agents[i++]] = provider;
        }
    }
    return expanded;
}
function formatZodError(error) {
    const issues = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `Config error at ${path}: ${issue.message}`;
    });
    return issues.join('\n');
}
export async function loadConfig() {
    let raw;
    try {
        let configPath = join(process.cwd(), '.palade', 'palade.config.ts');
        if (!existsSync(configPath)) {
            const fallbackPath = join(process.cwd(), 'palade.config.ts');
            if (existsSync(fallbackPath)) {
                configPath = fallbackPath;
            }
        }
        const configArgIdx = process.argv.indexOf('--config');
        if (configArgIdx !== -1 && process.argv.length > configArgIdx + 1) {
            const rawPath = process.argv[configArgIdx + 1];
            if (!rawPath.endsWith('.ts')) {
                throw new PaladeConfigError('Config file must be a .ts file', '--config');
            }
            const absolutePath = join(process.cwd(), rawPath);
            if (absolutePath !== process.cwd() && !absolutePath.startsWith(process.cwd() + sep)) {
                throw new PaladeConfigError('Config file must be within the working directory', '--config');
            }
            configPath = absolutePath;
        }
        const fileUrl = pathToFileURL(configPath).href;
        // Dynamic import with invalidation via import specifier — Node's ESM
        // loader ignores query strings for file:// URLs on most platforms, so we
        // do not append cache-busting params that break tsx/jiti.
        const mod = await import(fileUrl);
        const defaulted = mod.default ?? mod;
        if (defaulted !== null && typeof defaulted === 'object' && !Array.isArray(defaulted)) {
            raw = defaulted;
        }
        // Non-object exports (functions, primitives) are silently ignored.
    }
    catch (e) {
        const code = e?.code;
        if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_LOAD_ESM') {
            console.error(`Warning: Failed to load palade.config.ts: ${e.message}`);
        }
    }
    const envConfig = buildEnvConfig();
    const rawObj = raw ?? {};
    const rawProviders = rawObj.providers ?? {};
    const envProviders = envConfig.providers;
    const mergedProviders = { ...envProviders };
    for (const [key, val] of Object.entries(rawProviders)) {
        if (typeof val === 'object' && val !== null) {
            const existing = mergedProviders[key] ?? {};
            const mergedVal = { ...existing };
            const valObj = val;
            for (const [k, v] of Object.entries(valObj)) {
                if (v !== '' || !existing[k]) {
                    mergedVal[k] = v;
                }
            }
            // An explicit config apiKey must win over env-derived credentials. The
            // router resolves apiKeys ?? [apiKey], so a stale inherited apiKeys array
            // would silently shadow the override — drop it when config sets apiKey
            // alone.
            if (typeof valObj.apiKey === 'string' && valObj.apiKey !== '' && !('apiKeys' in valObj)) {
                delete mergedVal.apiKeys;
            }
            mergedProviders[key] = mergedVal;
        }
        else {
            mergedProviders[key] = val;
        }
    }
    const allConfiguredProviders = PROVIDER_NAMES.filter((p) => !!mergedProviders[p]?.apiKey);
    const freeProviders = allConfiguredProviders.filter((p) => p === 'opencode-zen' || p === 'ollama');
    const paidProviders = allConfiguredProviders.filter((p) => p !== 'opencode-zen' && p !== 'ollama');
    const defaultPrimary = freeProviders[0] ?? paidProviders[0] ?? 'opencode-zen';
    // Choose synthesis: prefer another free provider if available, otherwise the same free provider, otherwise a paid provider
    const defaultSynthesis = freeProviders.length > 1
        ? (freeProviders.find((p) => p !== defaultPrimary) ?? defaultPrimary)
        : (freeProviders[0] ?? paidProviders[0] ?? defaultPrimary);
    const rawSwarm = rawObj.swarm ?? {};
    const rawOutput = rawObj.output ?? {};
    const rawScore = rawObj.score ?? {};
    const merged = {
        ...DEFAULT_CONFIG,
        ...envConfig,
        ...rawObj,
        swarm: {
            ...DEFAULT_CONFIG.swarm,
            ...(envConfig.swarm ?? {}),
            ...rawSwarm,
            agentProviders: rawSwarm.agentProviders ?? undefined,
            primary: rawSwarm.primary ?? defaultPrimary,
            synthesis: rawSwarm.synthesis ?? defaultSynthesis,
        },
        output: {
            ...(DEFAULT_CONFIG.output ?? {}),
            ...(envConfig.output ?? {}),
            ...rawOutput,
        },
        score: {
            ...(DEFAULT_CONFIG.score ?? {}),
            ...(envConfig.score ?? {}),
            ...rawScore,
        },
        providers: mergedProviders,
    };
    const result = PaladeConfigSchema.safeParse(merged);
    if (!result.success) {
        throw new PaladeConfigError(formatZodError(result.error), 'schema', 'Check your palade.config.ts against the schema.');
    }
    // Resolve declarative provider shares into the per-agent map the router
    // actually consumes (getProvider('primary', agentName)); explicit
    // agentProviders entries win over expanded shares.
    if (result.data.swarm.providerShares) {
        result.data.swarm.agentProviders = {
            ...expandProviderShares(result.data.swarm.providerShares, result.data.swarm.agentCount),
            ...result.data.swarm.agentProviders,
        };
    }
    // Warn if allConfiguredProviders is empty but the user has a swarm.primary set
    if (allConfiguredProviders.length === 0 &&
        result.data.swarm.primary !== 'opencode-zen' &&
        result.data.swarm.primary !== 'ollama') {
        console.warn(chalk.yellow(`[config] swarm.primary is "${result.data.swarm.primary}" but no API key is configured for any provider. ` +
            "Set the provider's env var (e.g. GROQ_API_KEY) or configure apiKey in palade.config.ts."));
    }
    return result.data;
}
