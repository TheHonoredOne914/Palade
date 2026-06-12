export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'unknown'

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
}

export interface ScopeOptions {
  dirs?: string[]
  files?: string[]
  globs?: string[]
  targetPaths?: string[]
  annotationsOnly?: boolean
  projectRoot: string
}
