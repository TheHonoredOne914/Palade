import type { OutputLine } from '../components/OutputPane.js';
import type { PaladeConfig } from '../../config/schema.js';
interface CommandRunnerOptions {
    config?: PaladeConfig;
    projectRoot: string;
    appendLine: (line: OutputLine) => void;
    appendLines: (lines: OutputLine[]) => void;
    clearOutput: () => void;
    setStatus: (s: 'idle' | 'running') => void;
    onExit: () => void;
    onSettingsOpen?: () => void;
    getAbortSignal?: () => AbortSignal | undefined;
}
export declare function useCommandRunner(opts: CommandRunnerOptions): {
    dispatch: (raw: string) => Promise<void>;
};
export {};
