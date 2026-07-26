export declare function useCommandHistory(): {
    history: string[];
    pushToHistory: (cmd: string) => void;
    navigateHistory: (dir: "up" | "down") => string | null;
};
