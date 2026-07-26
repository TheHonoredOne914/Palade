import React from 'react';
interface HeaderProps {
    providerStatus: Record<string, boolean>;
    projectRoot: string;
    version: string;
}
export declare function Header({ providerStatus, projectRoot, version }: HeaderProps): React.JSX.Element;
export {};
