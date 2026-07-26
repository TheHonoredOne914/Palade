export interface BannerOptions {
    version: string;
    quiet?: boolean;
}
export declare function printBanner(opts: BannerOptions): void;
export declare function printGhostBanner(): void;
