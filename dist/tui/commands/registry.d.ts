export interface CommandDef {
    name: string;
    args?: string;
    description: string;
    usage: string;
    examples: string[];
}
export declare const COMMAND_REGISTRY: CommandDef[];
