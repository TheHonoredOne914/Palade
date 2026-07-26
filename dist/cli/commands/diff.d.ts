interface DiffOpts {
    base?: string;
    ci?: boolean;
    signal?: AbortSignal;
    tui?: boolean;
    strictTriage?: boolean;
}
export declare function diffCommand(opts: DiffOpts): Promise<void>;
export {};
