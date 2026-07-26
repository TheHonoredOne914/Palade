let _append = null;
let _originalLog;
let _originalWarn;
let _originalError;
let _originalClear;
export function mountOutputAdapter(append) {
    if (_append)
        return;
    _append = append;
    _originalLog = console.log;
    _originalWarn = console.warn;
    _originalError = console.error;
    _originalClear = console.clear;
    const formatArg = (a) => typeof a === 'string' ? a : a instanceof Error ? a.message : JSON.stringify(a);
    console.log = (...args) => {
        const text = args.map(formatArg).join(' ');
        _append?.({ type: 'output', text });
    };
    console.warn = (...args) => {
        const text = args.map(formatArg).join(' ');
        _append?.({ type: 'warn', text });
    };
    console.error = (...args) => {
        const text = args.map(formatArg).join(' ');
        _append?.({ type: 'error', text });
    };
    console.clear = () => {
        _append?.({ type: 'divider', text: '' });
    };
}
export function unmountOutputAdapter() {
    if (_originalLog)
        console.log = _originalLog;
    if (_originalWarn)
        console.warn = _originalWarn;
    if (_originalError)
        console.error = _originalError;
    if (_originalClear)
        console.clear = _originalClear;
    _append = null;
}
