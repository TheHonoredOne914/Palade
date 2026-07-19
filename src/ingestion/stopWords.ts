// Shared stop-word list for the two independent identifier-extraction paths
// that filter out common language keywords before scoring term overlap:
// keywordIndex.ts's getKeywordContext() and contextPacks.ts's
// identifierTerms(). These used to maintain separate, disagreeing lists
// (keywordIndex.ts additionally excluded 'class'/'async'/'await';
// contextPacks.ts additionally excluded 'from') — the union here is the
// single source of truth both now filter against (ing-005).
export const CODE_STOP_WORDS: ReadonlySet<string> = new Set([
  'async',
  'await',
  'class',
  'const',
  'export',
  'from',
  'function',
  'import',
  'interface',
  'return',
  'type',
])
