import { Command } from 'commander';
export declare const targetsCommand: Command;
export declare function runTargetsSearch(query: string, signal?: AbortSignal): Promise<void>;
export declare function runTargetsAdd(pkg: string, signal?: AbortSignal): Promise<void>;
export declare function runTargetsGenerate(query: string, signal?: AbortSignal): Promise<void>;
export declare function runTargetsList(signal?: AbortSignal): Promise<void>;
