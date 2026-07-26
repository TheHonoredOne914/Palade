import React from 'react';
export interface OutputLine {
    type: 'header' | 'input' | 'output' | 'success' | 'error' | 'warn' | 'dim' | 'divider' | 'finding';
    text: string;
    severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
    /** Stable identifier assigned when the line is appended. Used as the React
     * key so rolling-window re-renders don't reuse DOM nodes for wrong lines. */
    id?: number;
}
export declare function OutputLineItem({ line }: {
    line: OutputLine;
}): React.JSX.Element;
