import type { OutputLine } from './components/OutputPane.js';
type AppendFn = (line: OutputLine) => void;
export declare function mountOutputAdapter(append: AppendFn): void;
export declare function unmountOutputAdapter(): void;
export {};
