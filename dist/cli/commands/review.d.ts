interface ReviewOptions {
    target?: string;
    allTargets?: boolean;
    dir?: string;
    file?: string[];
    glob?: string;
    mode?: string;
    annotations?: boolean;
    pick?: boolean;
    depth?: number;
    format?: string;
    open?: boolean;
    quiet?: boolean;
    tui?: boolean;
    signal?: AbortSignal;
    dryRun?: boolean;
    economy?: boolean;
    exhaustive?: boolean;
    strictTriage?: boolean;
    noVerdict?: boolean;
    /** Commander stores `--no-verdict` under the positive key: false when the flag is passed. */
    verdict?: boolean;
}
export declare function reviewCommand(pathArg: string | undefined, opts: ReviewOptions): Promise<void>;
export {};
