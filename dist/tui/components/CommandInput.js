import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
export function CommandInput({ value, onChange, onSubmit, isRunning, }) {
    return (_jsxs(Box, { borderStyle: "round", borderColor: isRunning ? '#FF9933' : '#00D0FF', paddingX: 1, marginTop: 0, gap: 1, children: [_jsx(Text, { color: isRunning ? '#FF9933' : '#00D0FF', bold: true, children: isRunning ? _jsx(Spinner, { type: "aesthetic" }) : '❯' }), isRunning ? (_jsx(Text, { color: "#6B7280", children: "Swarm executing... (Ctrl+C to interrupt)" })) : (_jsx(Box, { flexGrow: 1, children: _jsx(TextInput, { value: value, onChange: onChange, onSubmit: onSubmit, placeholder: '/review · /score · /settings · /help' }) }))] }));
}
