import type { AgentFinding } from '../agents/base.js';
import type { CodeChunk } from '../ingestion/types.js';
export declare function validateAndFingerprintFindings(findings: AgentFinding[], chunks: CodeChunk[]): AgentFinding[];
