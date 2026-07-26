import { BaseSpecialistAgent } from '../base.js';
export declare const LOGIC_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT assume a function is called with the \"wrong\" arguments or in an invalid state elsewhere in the codebase unless the call site is visible in the chunks provided or surfaced via REPOSITORY CONTEXT. Only flag LOCALLY verifiable logic flaws.";
export declare const LOGIC_FOCUS = "CRITICAL INSTRUCTIONS:\n1. Pay close attention to the [REPOSITORY CONTEXT] provided in the chunks. Use it to verify that functions are being called with correct assumptions.\n2. Look for off-by-one errors, missing null checks, and unhandled promises.\n3. DO NOT report syntax errors, style issues, or purely architectural smells unless they directly cause logic bugs.";
export declare class LogicAgent extends BaseSpecialistAgent {
    name: "logic";
    protected getSystemPrompt(): string;
}
