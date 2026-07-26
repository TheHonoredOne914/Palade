import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from 'ink';
export function OutputLineItem({ line }) {
    switch (line.type) {
        case 'input':
            return (_jsxs(Box, { children: [_jsx(Text, { color: "#FF3366", bold: true, children: '❯ ' }), _jsx(Text, { color: "#E5E7EB", children: line.text })] }));
        case 'success':
            return (_jsxs(Box, { children: [_jsx(Text, { color: "#00E676", children: '  ✓  ' }), _jsx(Text, { color: "#D1FAE5", children: line.text })] }));
        case 'error':
            return (_jsxs(Box, { children: [_jsx(Text, { color: "#FF3366", children: '  ✗  ' }), _jsx(Text, { color: "#FEE2E2", children: line.text })] }));
        case 'warn':
            return (_jsxs(Box, { children: [_jsx(Text, { color: "#FFEA00", children: '  ⚠  ' }), _jsx(Text, { color: "#FEF3C7", children: line.text })] }));
        case 'dim':
            return (_jsx(Box, { paddingLeft: 2, children: _jsx(Text, { color: "#6B7280", children: line.text }) }));
        case 'divider':
            return (_jsx(Box, { children: _jsx(Text, { color: "#374151", children: '─'.repeat(60) }) }));
        case 'finding':
            return _jsx(FindingLine, { text: line.text, severity: line.severity });
        default:
            return (_jsx(Box, { paddingLeft: 2, children: _jsx(Text, { color: "#C9D1D9", children: line.text }) }));
    }
}
function FindingLine({ text, severity }) {
    const chipColors = {
        critical: { bg: '#FF3366', label: 'CRIT' },
        high: { bg: '#FF9933', label: 'HIGH' },
        medium: { bg: '#FFEA00', label: 'MED ' },
        low: { bg: '#6B7280', label: 'LOW ' },
        info: { bg: '#00D0FF', label: 'INFO' },
    };
    const chip = chipColors[severity ?? 'info'] ?? chipColors.info;
    return (_jsxs(Box, { paddingLeft: 2, gap: 1, children: [_jsxs(Text, { backgroundColor: chip.bg, color: "#000000", bold: true, children: [' ', chip.label, ' '] }), _jsx(Text, { color: "#E5E7EB", children: text })] }));
}
