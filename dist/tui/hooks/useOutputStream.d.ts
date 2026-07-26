import type { OutputLine } from '../components/OutputPane.js';
export declare function useOutputStream(): {
    lines: OutputLine[];
    appendLine: (line: OutputLine) => void;
    appendLines: (newLines: OutputLine[]) => void;
    clearOutput: () => void;
    clearNonce: number;
};
