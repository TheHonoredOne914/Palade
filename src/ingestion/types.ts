export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'unknown'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'ruby'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'dart'

export interface LanguageProfile {
  primary: Language[]
  isFirstClass: boolean
}

export interface Annotation {
  type: 'review' | 'focus' | 'ignore'
  value?: string
  line: number
  // True when this `ignore` annotation is an explicit whole-file directive
  // (`@palade ignore-file`), as opposed to a line-level `@palade ignore`
  // that only suppresses findings on the annotated line.
  fileLevel?: boolean
}

export interface FileManifest {
  path: string
  absolutePath: string
  language: Language
  sizeBytes: number
  linesOfCode: number
  annotations: Annotation[]
  lastModified: Date
  churnCount?: number
  importCount?: number
  importers?: string[]
  _rawImports?: string[]
}

export interface CodeChunk {
  id: string
  filePath: string
  startLine: number
  endLine: number
  content: string
  contextPrefix?: string
  symbolName?: string
  tokenCount: number
  language: Language
  complexity?: number
  // Per-top-level-node complexity breakdown for chunks that bundle multiple
  // top-level AST nodes together (to fill the token budget) — lets
  // agents/base.ts's annotateComplexity attach the complexity of the
  // SPECIFIC node enclosing a finding's line instead of `complexity` above
  // (a chunk-wide sum across every node in the chunk). Only populated by
  // chunkByAST; absent for line/bracket-based chunks (ing-001).
  nodeComplexities?: { startLine: number; endLine: number; complexity: number }[]
  // Set on the last chunk kept for a file when chunkFiles() had to drop
  // trailing chunks past MAX_CHUNKS_PER_FILE, so callers can detect
  // incomplete coverage programmatically (not just via log output).
  truncated?: boolean
}

export interface ScopeOptions {
  dirs?: string[]
  files?: string[]
  globs?: string[]
  targetPaths?: string[]
  annotationsOnly?: boolean
  projectRoot: string
  symbolChunks?: CodeChunk[]
}
