interface SettingsOptions {
    set?: string[];
    init?: boolean;
    list?: boolean;
}
export declare function settingsCommand(opts: SettingsOptions): Promise<void>;
export {};
