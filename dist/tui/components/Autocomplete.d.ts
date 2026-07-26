import React from 'react';
interface AutocompleteProps {
    input: string;
    projectRoot: string;
    onSelect: (cmd: string) => void;
}
export declare function Autocomplete({ input, projectRoot, onSelect, }: AutocompleteProps): React.JSX.Element;
export {};
