export declare function askQuestion(query: string): Promise<string>;
export declare function askConfirm(query: string, defaultYes?: boolean): Promise<boolean>;
export declare function askList(query: string, choices: string[]): Promise<string>;
export declare function askCheckbox(query: string, choices: string[]): Promise<string[]>;
