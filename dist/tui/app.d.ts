import React from 'react';
import type { PaladeConfig } from '../config/schema.js';
interface AppProps {
    config?: PaladeConfig;
    providerStatus: Record<string, boolean>;
    projectRoot: string;
    version: string;
    configError?: string;
    noProvider?: boolean;
}
export declare function App({ config, providerStatus, projectRoot, version, configError, noProvider, }: AppProps): React.JSX.Element;
export {};
