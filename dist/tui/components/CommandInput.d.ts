import React from 'react';
interface CommandInputProps {
    value: string;
    onChange: (val: string) => void;
    onSubmit: (val: string) => void;
    isRunning: boolean;
}
export declare function CommandInput({ value, onChange, onSubmit, isRunning, }: CommandInputProps): React.JSX.Element;
export {};
