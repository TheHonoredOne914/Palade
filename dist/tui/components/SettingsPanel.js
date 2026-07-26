import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { saveApiKey, saveConfigValue, saveConfigValues, PROVIDERS } from '../../config/apiKey.js';
import { fetchModels } from '../../config/models.js';
import { BUILTIN_NAMES } from '../../agents/registry.js';
const FOCUS_ORDER = ['key', 'model', 'share', 'agents', 'swarm', 'synthesis'];
const MAX_AGENTS = BUILTIN_NAMES.length;
export function SettingsPanel({ projectRoot, selectedProviderIdx, existingKeys, swarmPrimary, swarmSynthesis, swarmAgentCount, providerShares, currentModels, onKeySaved, onClose, }) {
    const [inputValue, setInputValue] = useState('');
    const [manualModelInput, setManualModelInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [focusField, setFocusField] = useState('key');
    const [modelState, setModelState] = useState({});
    const [modelIdx, setModelIdx] = useState(0);
    const [localModels, setLocalModels] = useState(currentModels);
    const [swarmIdx, setSwarmIdx] = useState(() => Math.max(0, PROVIDERS.findIndex((p) => p.id === swarmPrimary)));
    const [synthesisIdx, setSynthesisIdx] = useState(() => Math.max(0, PROVIDERS.findIndex((p) => p.id === swarmSynthesis)));
    const [localSwarmPrimary, setLocalSwarmPrimary] = useState(swarmPrimary);
    const [localSwarmSynthesis, setLocalSwarmSynthesis] = useState(swarmSynthesis);
    const [agentCount, setAgentCount] = useState(Math.min(swarmAgentCount, MAX_AGENTS));
    const [savedAgentCount, setSavedAgentCount] = useState(Math.min(swarmAgentCount, MAX_AGENTS));
    const [shares, setShares] = useState(providerShares);
    const [savedShares, setSavedShares] = useState(providerShares);
    useEffect(() => setLocalModels(currentModels), [currentModels]);
    useEffect(() => setLocalSwarmPrimary(swarmPrimary), [swarmPrimary]);
    useEffect(() => setLocalSwarmSynthesis(swarmSynthesis), [swarmSynthesis]);
    useEffect(() => {
        if (focusField === 'swarm') {
            setSwarmIdx(Math.max(0, PROVIDERS.findIndex((p) => p.id === localSwarmPrimary)));
        }
        else if (focusField === 'synthesis') {
            setSynthesisIdx(Math.max(0, PROVIDERS.findIndex((p) => p.id === localSwarmSynthesis)));
        }
    }, [focusField, localSwarmPrimary, localSwarmSynthesis]);
    const selectedProvider = PROVIDERS[selectedProviderIdx];
    const modelEntry = modelState[selectedProvider.id];
    const hasFetchedModels = modelEntry?.status === 'loaded' && modelEntry.models.length > 0;
    // Fetch the live model list the first time the model field is focused for a
    // given provider tab. Skipped when there is no key yet — an unauthenticated
    // call would just fail, so go straight to the manual-entry fallback.
    useEffect(() => {
        if (focusField !== 'model')
            return;
        let active = true;
        const id = selectedProvider.id;
        const cached = modelState[id];
        if (cached) {
            // Already fetched for this provider (maybe on an earlier tab visit) —
            // resync the selected index to its current model instead of carrying
            // over whatever index was selected for the previously focused tab.
            if (cached.status === 'loaded' && cached.models.length > 0) {
                const current = localModels[id];
                const idx = current ? cached.models.indexOf(current) : -1;
                setModelIdx(idx >= 0 ? idx : 0);
            }
            return;
        }
        const key = existingKeys[id];
        if (!key)
            return;
        setModelState((prev) => ({ ...prev, [id]: { status: 'loading', models: [] } }));
        fetchModels(id, key)
            .then((models) => {
            if (!active)
                return;
            setModelState((prev) => ({ ...prev, [id]: { status: 'loaded', models } }));
            if (models.length > 0) {
                const current = localModels[id];
                const idx = current ? models.indexOf(current) : -1;
                setModelIdx(idx >= 0 ? idx : 0);
            }
        })
            .catch((err) => {
            if (!active)
                return;
            setModelState((prev) => ({ ...prev, [id]: { status: 'loaded', models: [] } }));
            setMessage(`⚠ Could not fetch models for ${selectedProvider.label}: ${err instanceof Error ? err.message : String(err)}`);
        });
        return () => {
            active = false;
        };
    }, [
        focusField,
        selectedProviderIdx,
        existingKeys,
        modelState,
        localModels,
        selectedProvider.label,
    ]);
    const handleSubmit = useCallback(async (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
            onClose();
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            await saveApiKey(projectRoot, selectedProvider.id, trimmed);
            onKeySaved(selectedProvider.id, trimmed);
            setInputValue('');
            setMessage(`✓ ${selectedProvider.label} API key saved to .env`);
        }
        catch (err) {
            setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            setSaving(false);
        }
    }, [projectRoot, selectedProvider, onClose, onKeySaved]);
    const saveModel = useCallback(async (model) => {
        if (!model.trim())
            return;
        try {
            await saveConfigValue(projectRoot, `providers.${selectedProvider.id}.model`, model.trim());
            setLocalModels((prev) => ({ ...prev, [selectedProvider.id]: model.trim() }));
            setManualModelInput('');
            setMessage(`✓ ${selectedProvider.label} model set to ${model.trim()}`);
        }
        catch (err) {
            setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [projectRoot, selectedProvider]);
    const saveSwarmRole = useCallback(async (role, providerId) => {
        try {
            await saveConfigValue(projectRoot, `swarm.${role}`, providerId);
            if (role === 'primary')
                setLocalSwarmPrimary(providerId);
            else
                setLocalSwarmSynthesis(providerId);
            setMessage(`✓ swarm.${role} set to ${providerId}`);
        }
        catch (err) {
            setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [projectRoot]);
    const saveAgentCount = useCallback(async (count) => {
        try {
            // Trim already-saved provider shares whose sum now exceeds the new
            // agentCount — mirrors the share field's own clamp (tui-001) just
            // above. Without this, shrinking agentCount below the saved shares'
            // total silently reproduces the over-allocation bug that clamp was
            // written to prevent: expandProviderShares would then truncate the
            // excess based on object key order with no warning shown.
            const total = Object.values(shares).reduce((sum, v) => sum + (v ?? 0), 0);
            let trimmed = false;
            const next = { ...shares };
            if (total > count) {
                trimmed = true;
                let excess = total - count;
                for (const id of Object.keys(next)) {
                    if (excess <= 0)
                        break;
                    const val = next[id] ?? 0;
                    const reduceBy = Math.min(val, excess);
                    next[id] = val - reduceBy;
                    excess -= reduceBy;
                }
            }
            const updates = { 'swarm.agentCount': count };
            for (const [id, val] of Object.entries(next)) {
                if (val !== savedShares[id]) {
                    updates[`swarm.providerShares.${id}`] = val;
                }
            }
            await saveConfigValues(projectRoot, updates);
            setShares(next);
            setSavedShares(next);
            setSavedAgentCount(count);
            setMessage(trimmed
                ? `✓ swarm.agentCount set to ${count} (provider shares trimmed to fit)`
                : `✓ swarm.agentCount set to ${count}`);
        }
        catch (err) {
            setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [projectRoot, shares, savedShares]);
    const saveShare = useCallback(async (providerId, count) => {
        try {
            await saveConfigValue(projectRoot, `swarm.providerShares.${providerId}`, count);
            setSavedShares((prev) => ({ ...prev, [providerId]: count }));
            setMessage(`✓ ${providerId} agent share set to ${count}`);
        }
        catch (err) {
            setMessage(`✗ Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [projectRoot]);
    useInput((_input, key) => {
        if (key.upArrow) {
            setFocusField((f) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(f) - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length]);
            return;
        }
        if (key.downArrow) {
            setFocusField((f) => FOCUS_ORDER[(FOCUS_ORDER.indexOf(f) + 1) % FOCUS_ORDER.length]);
            return;
        }
        if (focusField === 'model' && hasFetchedModels) {
            const models = modelEntry.models;
            if (key.leftArrow) {
                setModelIdx((i) => Math.max(0, i - 1));
                return;
            }
            if (key.rightArrow) {
                setModelIdx((i) => Math.min(models.length - 1, i + 1));
                return;
            }
            if (key.return) {
                saveModel(models[modelIdx]);
                return;
            }
        }
        if (focusField === 'share') {
            const id = selectedProvider.id;
            const current = shares[id] ?? 0;
            if (key.leftArrow) {
                setShares((prev) => ({ ...prev, [id]: Math.max(0, current - 1) }));
                return;
            }
            if (key.rightArrow) {
                setShares((prev) => {
                    const othersTotal = Object.entries(prev).reduce((sum, [pid, val]) => (pid === id ? sum : sum + (val ?? 0)), 0);
                    // Bound against the SAVED/persisted agentCount, not the live
                    // agentCount state — the user can bump 'agents' without pressing
                    // Enter (unsaved), then navigate to 'share' and would otherwise be
                    // allowed to persist providerShares whose sum exceeds the
                    // actually-persisted-to-disk swarm.agentCount (tui-00X).
                    const maxForThis = Math.max(0, savedAgentCount - othersTotal);
                    return { ...prev, [id]: Math.min(maxForThis, (prev[id] ?? 0) + 1) };
                });
                return;
            }
            if (key.return) {
                saveShare(id, current);
                return;
            }
        }
        if (focusField === 'agents') {
            if (key.leftArrow) {
                setAgentCount((c) => (c <= 1 ? c : c - 1));
                return;
            }
            if (key.rightArrow) {
                setAgentCount((c) => Math.min(MAX_AGENTS, c + 1));
                return;
            }
            if (key.return) {
                saveAgentCount(agentCount);
                return;
            }
        }
        if (focusField === 'swarm') {
            if (key.leftArrow) {
                setSwarmIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length);
                return;
            }
            if (key.rightArrow) {
                setSwarmIdx((i) => (i + 1) % PROVIDERS.length);
                return;
            }
            if (key.return) {
                saveSwarmRole('primary', PROVIDERS[swarmIdx].id);
                return;
            }
        }
        if (focusField === 'synthesis') {
            if (key.leftArrow) {
                setSynthesisIdx((i) => (i - 1 + PROVIDERS.length) % PROVIDERS.length);
                return;
            }
            if (key.rightArrow) {
                setSynthesisIdx((i) => (i + 1) % PROVIDERS.length);
                return;
            }
            if (key.return) {
                saveSwarmRole('synthesis', PROVIDERS[synthesisIdx].id);
                return;
            }
        }
    });
    const modelDisplay = hasFetchedModels
        ? (modelEntry.models[modelIdx] ?? '')
        : modelEntry?.status === 'loading'
            ? 'loading models…'
            : (localModels[selectedProvider.id] ?? '(type a model id below)');
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "#FF3366", paddingX: 2, paddingY: 1, marginX: 1, children: [_jsxs(Box, { marginBottom: 1, gap: 2, children: [_jsx(Text, { color: "#FF3366", bold: true, children: "\u2699 PALADE SETTINGS" }), _jsx(Text, { color: "#6B7280", children: "\u2014 Tab: provider \u00B7 \u2191\u2193: field \u00B7 \u2190\u2192: value \u00B7 Enter: save \u00B7 empty Enter: close" })] }), _jsxs(Box, { gap: 0, marginBottom: 1, children: [PROVIDERS.map((p, i) => {
                        const hasKey = !!existingKeys[p.id];
                        const isSelected = i === selectedProviderIdx;
                        return (_jsx(Box, { borderStyle: isSelected ? 'round' : undefined, borderColor: isSelected ? '#FF3366' : undefined, paddingX: 1, marginRight: 1, children: _jsxs(Text, { color: isSelected ? '#FF3366' : hasKey ? '#10B981' : '#6B7280', bold: isSelected, children: [hasKey ? '● ' : '○ ', p.label] }) }, p.id));
                    }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: [' ', "[Tab] to switch"] })] }), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'key' ? '#FF3366' : '#9CA3AF', bold: focusField === 'key', children: [focusField === 'key' ? '▸ ' : '  ', selectedProvider.label, " key:", ' '] }), existingKeys[selectedProvider.id] ? (_jsx(Text, { color: "#10B981", children: '●●●●●● …' + existingKeys[selectedProvider.id].slice(-6) })) : (_jsx(Text, { color: "#6B7280", dimColor: true, children: "not set" }))] }), focusField === 'key' && (_jsxs(Box, { borderStyle: "single", borderColor: "#FF3366", paddingX: 1, marginBottom: 1, children: [_jsxs(Text, { color: "#FF3366", bold: true, children: ["key \u203A", ' '] }), _jsx(Box, { flexGrow: 1, children: _jsx(TextInput, { value: inputValue, onChange: setInputValue, onSubmit: handleSubmit, placeholder: saving
                                ? 'Saving...'
                                : `Paste ${selectedProvider.label} API key, press Enter to save`, mask: "*" }) })] })), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'model' ? '#FF3366' : '#9CA3AF', bold: focusField === 'model', children: [focusField === 'model' ? '▸ ' : '  ', "Model: ", '< '] }), _jsx(Text, { color: focusField === 'model' ? '#00D0FF' : '#D1D5DB', children: modelDisplay }), _jsx(Text, { color: focusField === 'model' ? '#FF3366' : '#9CA3AF', children: ' >' })] }), focusField === 'model' && !hasFetchedModels && modelEntry?.status !== 'loading' && (_jsxs(Box, { borderStyle: "single", borderColor: "#FF3366", paddingX: 1, marginBottom: 1, children: [_jsxs(Text, { color: "#FF3366", bold: true, children: ["model \u203A", ' '] }), _jsx(Box, { flexGrow: 1, children: _jsx(TextInput, { value: manualModelInput, onChange: setManualModelInput, onSubmit: saveModel, placeholder: "Type a model id, press Enter to save" }) })] })), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'share' ? '#FF3366' : '#9CA3AF', bold: focusField === 'share', children: [focusField === 'share' ? '▸ ' : '  ', "Agent share: ", '< '] }), _jsx(Text, { color: focusField === 'share' ? '#00D0FF' : '#D1D5DB', children: shares[selectedProvider.id] ?? 0 }), _jsx(Text, { color: focusField === 'share' ? '#FF3366' : '#9CA3AF', children: ' >' }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: ['  (', Object.values(shares).reduce((a, b) => a + b, 0), '/', agentCount, ' allocated, saved: ', savedShares[selectedProvider.id] ?? 0, '; unallocated agents use the swarm provider)'] })] }), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'agents' ? '#FF3366' : '#9CA3AF', bold: focusField === 'agents', children: [focusField === 'agents' ? '▸ ' : '  ', "Agent count: ", '< '] }), _jsx(Text, { color: focusField === 'agents' ? '#00D0FF' : '#D1D5DB', children: agentCount }), _jsx(Text, { color: focusField === 'agents' ? '#FF3366' : '#9CA3AF', children: ' >' }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: ['  (max ', MAX_AGENTS, ', saved: ', savedAgentCount, ')'] })] }), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'swarm' ? '#FF3366' : '#9CA3AF', bold: focusField === 'swarm', children: [focusField === 'swarm' ? '▸ ' : '  ', "Swarm provider: ", '< '] }), _jsx(Text, { color: focusField === 'swarm' ? '#00D0FF' : '#D1D5DB', children: PROVIDERS[swarmIdx].label }), _jsx(Text, { color: focusField === 'swarm' ? '#FF3366' : '#9CA3AF', children: ' >' }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: ['  (current: ', localSwarmPrimary, ')'] })] }), _jsxs(Box, { marginBottom: 1, children: [_jsxs(Text, { color: focusField === 'synthesis' ? '#FF3366' : '#9CA3AF', bold: focusField === 'synthesis', children: [focusField === 'synthesis' ? '▸ ' : '  ', "Synthesis provider: ", '< '] }), _jsx(Text, { color: focusField === 'synthesis' ? '#00D0FF' : '#D1D5DB', children: PROVIDERS[synthesisIdx].label }), _jsx(Text, { color: focusField === 'synthesis' ? '#FF3366' : '#9CA3AF', children: ' >' }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: ['  (current: ', localSwarmSynthesis, ')'] })] }), _jsxs(Text, { color: "#4B5563", dimColor: true, children: [' ', "Env var: ", selectedProvider.env] }), message && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: message.startsWith('✓') ? '#10B981' : '#EF4444', bold: true, children: message }) }))] }));
}
