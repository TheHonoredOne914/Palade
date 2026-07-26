import { type AgentName, BaseSpecialistAgent } from '../base.js';
export declare const PRAGMATISM_WARNING = "CRITICAL CONTEXT WARNING: You are reviewing PARTIAL chunks of a codebase, not the entire program. Do NOT judge an abstraction as \"unneeded\" or \"over-engineered\" based on a single call site \u2014 it may have other callers or planned uses not visible in the current chunk. Only flag over-engineering you can justify from what's LOCALLY visible.";
export declare const PRAGMATISM_FOCUS = "Focus on these principles:\n1. Simplicity First: Identify overengineered code, bloated abstractions for single-use code, or \"configurability\" that isn't needed. (If 200 lines could be 50, flag it).\n2. Think Before Coding: Identify code that makes silent, unsafe assumptions or hides confusion behind complex logic.\n3. Surgical Changes: Identify unnecessary formatting changes or unrelated refactors if visible.\n4. Goal-Driven Execution: Identify critical logic missing verifiable success criteria.";
export declare class PragmatismAgent extends BaseSpecialistAgent {
    name: AgentName;
    protected getSystemPrompt(): string;
}
