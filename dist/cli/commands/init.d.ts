export declare const CONFIG_TEMPLATE = "// palade.config.ts\nexport default {\n  // AI providers are auto-detected from environment variables\n  // e.g., GROQ_API_KEY, OPENROUTER_API_KEY, etc.\n  \n  // swarm: {\n  //   agentCount: 6,\n  //   economyMode: false, // Set to true to opt into cheaper combined-call mode\n  // }\n}\n";
export declare const IGNORE_TEMPLATE = "node_modules/\ndist/\nbuild/\n.git/\n*.lock\n*.min.js\n*.min.css\ncoverage/\n.palade/\n";
export declare function initCommand(opts?: {
    yes?: boolean;
    signal?: AbortSignal;
    tui?: boolean;
}): Promise<void>;
