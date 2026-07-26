import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { COMMAND_REGISTRY } from '../commands/registry.js';
import { loadTargets } from '../../targets/loader.js';
export function Autocomplete({ input, projectRoot, onSelect, }) {
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [targets, setTargets] = useState([]);
    useEffect(() => {
        loadTargets(projectRoot)
            .then(setTargets)
            .catch(() => { });
    }, [projectRoot]);
    const matches = useMemo(() => {
        // Target autocomplete
        const cmdMatch = input.match(/^\/(review)(.*)$/);
        if (cmdMatch) {
            const [, cmd, rest] = cmdMatch;
            const isTargetFlag = rest.includes('--target');
            let before = `/${cmd} `;
            let query = rest.trim().toLowerCase();
            if (isTargetFlag) {
                const parts = rest.split('--target');
                before = `/${cmd}` + parts[0] + '--target ';
                query = (parts[1] ?? '').trim().toLowerCase();
            }
            // Hide target suggestions while the user is typing an unrelated flag
            // (like --dir or --format) — but not while typing a target name
            // directly (no leading '--'), which should still autocomplete.
            const trimmedRest = rest.trim();
            if (!isTargetFlag && trimmedRest.startsWith('--') && !trimmedRest.startsWith('--target')) {
                return [];
            }
            const targetMatches = targets
                .filter((t) => t.name.toLowerCase().includes(query) ||
                `--target ${t.name}`.toLowerCase().includes(query))
                .map((t) => ({
                text: isTargetFlag ? before + t.name : `/${cmd} --target ${t.name}`,
                display: isTargetFlag ? t.name : `--target ${t.name}`,
                desc: `Target (${Array.isArray(t.entry) ? t.entry.length + ' files' : t.entry})`,
            }))
                .slice(0, 5);
            if (!isTargetFlag && cmd === 'review' && (query === '' || query === '.')) {
                return [
                    { text: '/review .', display: '/review .', desc: 'Full codebase review' },
                    ...targetMatches,
                ];
            }
            return targetMatches;
        }
        // Command autocomplete
        const query = input.slice(1).toLowerCase().split(' ')[0] ?? '';
        return COMMAND_REGISTRY.filter((cmd) => cmd.name.includes(query) || cmd.description.toLowerCase().includes(query))
            .map((cmd) => ({
            text: '/' + cmd.name + (cmd.args ? ' ' : ''),
            display: '/' + cmd.name + (cmd.args ? ' ' + cmd.args : ''),
            desc: cmd.description,
        }))
            .slice(0, 6);
    }, [input, targets]);
    useEffect(() => {
        setSelectedIdx(0);
    }, [matches]);
    // When nothing matches, hide the (empty) autocomplete so the parent's Enter
    // handler can submit the raw input instead of both handlers swallowing it.
    useEffect(() => {
        if (matches.length === 0)
            onSelect('');
    }, [matches, onSelect]);
    useInput((keyInput, key) => {
        if (key.tab || key.downArrow) {
            setSelectedIdx((i) => Math.min(i + 1, matches.length - 1));
        }
        if (key.upArrow) {
            setSelectedIdx((i) => Math.max(i - 1, 0));
        }
        if (key.escape) {
            onSelect(''); // close autocomplete
        }
        if (key.return && matches[selectedIdx]) {
            onSelect(matches[selectedIdx].text);
        }
    });
    return (_jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "#00D0FF", paddingX: 1, marginX: 1, height: 8, children: [matches.map((match, i) => (_jsxs(Box, { gap: 2, children: [_jsx(Text, { color: i === selectedIdx ? '#000000' : '#E5E7EB', backgroundColor: i === selectedIdx ? '#00D0FF' : undefined, bold: i === selectedIdx, children: ' ' + match.display }), _jsx(Text, { color: i === selectedIdx ? '#E5E7EB' : '#6B7280', children: match.desc }), i === selectedIdx && _jsx(Text, { color: "#FF9933", children: " \u21B5 to fill" })] }, match.display + i))), _jsx(Box, { marginTop: 0, children: _jsx(Text, { color: "#374151", children: " \u2191\u2193 navigate \u21B5 select Tab cycle" }) })] }));
}
