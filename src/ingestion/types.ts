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
}

export interface CodeChunk {
  id: string
  filePath: string
  startLine: number
  endLine: number
  content: string
  symbolName?: string
  tokenCount: number
  language: Language
  complexity?: number
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
