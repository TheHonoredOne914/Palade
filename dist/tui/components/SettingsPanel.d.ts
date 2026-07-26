import React from 'react';
interface SettingsPanelProps {
    projectRoot: string;
    /** Controlled: parent drives provider selection via Tab */
    selectedProviderIdx: number;
    existingKeys: Record<string, string>;
    swarmPrimary: string;
    swarmSynthesis: string;
    swarmAgentCount: number;
    providerShares: Record<string, number>;
    currentModels: Record<string, string>;
    onKeySaved: (providerId: string, key: string) => void;
    onClose: (message?: string) => void;
}
export declare function SettingsPanel({ projectRoot, selectedProviderIdx, existingKeys, swarmPrimary, swarmSynthesis, swarmAgentCount, providerShares, currentModels, onKeySaved, onClose, }: SettingsPanelProps): React.JSX.Element;
export {};
