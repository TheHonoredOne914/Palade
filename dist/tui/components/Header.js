import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
import { ASCII_ART, GRADIENT } from '../../ui/asciiArt.js';
import { PROVIDERS } from '../../config/apiKey.js';
export function Header({ providerStatus, projectRoot, version }) {
    const projectName = projectRoot.split(/[/\\]/).at(-1) ?? projectRoot;
    return (_jsxs(Box, { flexDirection: "column", flexShrink: 0, marginBottom: 1, borderStyle: "round", borderColor: "#374151", paddingX: 2, paddingY: 1, children: [_jsxs(Box, { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", children: [_jsx(Box, { flexDirection: "column", children: ASCII_ART.map((line, i) => (_jsx(Text, { color: GRADIENT[i] ?? '#FF3366', bold: true, children: line }, i))) }), _jsx(Box, { paddingBottom: 1, paddingRight: 2, children: _jsx(Text, { color: "#6B7280", italic: true, children: "By Carren Mathew" }) })] }), _jsxs(Box, { justifyContent: "space-between", marginTop: 1, children: [_jsxs(Box, { gap: 1, children: [_jsxs(Text, { color: "#00D0FF", bold: true, children: ["v", version] }), _jsx(Text, { color: "#6B7280", children: "\u2502" }), _jsx(Text, { color: "#E5E7EB", children: "codebase intelligence" }), _jsx(Text, { color: "#6B7280", children: "\u2502" }), _jsx(Text, { color: "#FF9933", bold: true, children: projectName })] }), _jsx(Box, { gap: 2, children: PROVIDERS.map((p) => (_jsx(ProviderDot, { name: p.id, active: providerStatus[p.id] ?? false }, p.id))) })] }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "#6B7280", dimColor: true, children: projectRoot }) })] }));
}
function ProviderDot({ name, active }) {
    return (_jsxs(Box, { gap: 1, children: [_jsx(Text, { color: active ? '#00E676' : '#374151', children: active ? '●' : '○' }), _jsx(Text, { color: active ? '#E5E7EB' : '#6B7280', children: name })] }));
}
