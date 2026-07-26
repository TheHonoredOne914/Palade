export type DefectCategory = 'real-bug' | 'false-positive';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export interface Defect {
    id: string;
    file: string;
    lineStart: number;
    lineEnd: number;
    severity: Severity;
    category: DefectCategory;
    hypothesis: string;
    reality: string;
    fromReport: boolean;
}
export declare const SCHEDULER_FILE = "src/orchestrator/scheduler.ts";
export declare const FINDING_VALIDATION_FILE = "src/orchestrator/findingValidation.ts";
export declare const MERGER_FILE = "src/orchestrator/merger.ts";
export declare const TRIAGE_FILE = "src/orchestrator/triage.ts";
export declare const SCHEDULER_DEFECTS: Defect[];
export declare const FINDING_VALIDATION_DEFECTS: Defect[];
export declare const MERGER_DEFECTS: Defect[];
export declare const TRIAGE_DEFECTS: Defect[];
export declare const ALL_DEFECTS: Defect[];
export declare function realBugCount(defects?: Defect[]): number;
