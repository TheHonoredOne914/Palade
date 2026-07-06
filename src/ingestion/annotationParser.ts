import { readFile } from 'node:fs/promises'
import type { Annotation, FileManifest, CodeChunk } from './types.js'
import type { AnnotationSummary, AgentFinding } from '../agents/base.js'

const REVIEW_RE = /\/\/\s*@palade\s+review\s*:\s*(.+)/i
const FOCUS_RE = /\/\/\s*@palade\s+focus\s*:\s*(.+)/i
// Explicit whole-file directive. Must be checked before IGNORE_RE, since
// `// @palade ignore-file` also matches the looser line-level IGNORE_RE.
const FILE_IGNORE_RE = /\/\/\s*@palade\s+ignore-file\b/i
const IGNORE_RE = /\/\/\s*@palade\s+ignore\b/i
const PY_REVIEW_RE = /#\s*@palade\s+review\s*:\s*(.+)/i
const PY_FOCUS_RE = /#\s*@palade\s+focus\s*:\s*(.+)/i
const PY_FILE_IGNORE_RE = /#\s*@palade\s+ignore-file\b/i
const PY_IGNORE_RE = /#\s*@palade\s+ignore\b/i

export function parseFile(absolutePath: string, isPython: boolean = false): Promise<Annotation[]> {
  return parseFileAsync(absolutePath, isPython)
}

async function parseFileAsync(absolutePath: string, isPython: boolean): Promise<Annotation[]> {
  let content: string
  try {
    content = await readFile(absolutePath, 'utf-8')
  } catch {
    return []
  }

  const annotations: Annotation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    if (isPython) {
      const reviewMatch = line.match(PY_REVIEW_RE)
      if (reviewMatch) {
        annotations.push({ type: 'review', value: reviewMatch[1].trim(), line: lineNum })
        continue
      }
      const focusMatch = line.match(PY_FOCUS_RE)
      if (focusMatch) {
        annotations.push({ type: 'focus', value: focusMatch[1].trim(), line: lineNum })
        continue
      }
      if (line.match(PY_FILE_IGNORE_RE)) {
        annotations.push({ type: 'ignore', line: lineNum, fileLevel: true })
        continue
      }
      if (line.match(PY_IGNORE_RE)) {
        annotations.push({ type: 'ignore', line: lineNum })
        continue
      }
      // No Python annotation matched — skip the JS-style patterns below
      // so that e.g. a Python string `// @palade review: x` is not falsely
      // matched by the JS-style regexes.
      continue
    }

    const reviewMatch = line.match(REVIEW_RE)
    if (reviewMatch) {
      annotations.push({ type: 'review', value: reviewMatch[1].trim(), line: lineNum })
      continue
    }
    const focusMatch = line.match(FOCUS_RE)
    if (focusMatch) {
      annotations.push({ type: 'focus', value: focusMatch[1].trim(), line: lineNum })
      continue
    }
    if (line.match(FILE_IGNORE_RE)) {
      annotations.push({ type: 'ignore', line: lineNum, fileLevel: true })
      continue
    }
    if (line.match(IGNORE_RE)) {
      annotations.push({ type: 'ignore', line: lineNum })
    }
  }

  return annotations
}

export function parseAnnotations(manifests: FileManifest[]): Promise<Map<string, Annotation[]>> {
  return parseAnnotationsAsync(manifests)
}

async function parseAnnotationsAsync(
  manifests: FileManifest[]
): Promise<Map<string, Annotation[]>> {
  const map = new Map<string, Annotation[]>()
  // Parse all files concurrently instead of sequentially
  const results = await Promise.all(
    manifests.map(async (manifest) => {
      const isPython = manifest.language === 'python'
      const annotations = await parseFileAsync(manifest.absolutePath, isPython)
      return { path: manifest.path, annotations }
    })
  )
  for (const { path, annotations } of results) {
    if (annotations.length > 0) {
      map.set(path, annotations)
    }
  }
  return map
}

// ── Phase 11: Annotation Summary ─────────────────────────────

export function buildAnnotationSummary(
  manifests: FileManifest[],
  chunks: CodeChunk[]
): AnnotationSummary {
  const reviewRequests: AnnotationSummary['reviewRequests'] = []
  const focusRequests: AnnotationSummary['focusRequests'] = []
  const ignoredFiles: string[] = []
  const ignoredLines: AnnotationSummary['ignoredLines'] = []

  for (const manifest of manifests) {
    for (const annotation of manifest.annotations) {
      if (annotation.type === 'ignore') {
        // Only an explicit `@palade ignore-file` directive drops the whole
        // file. A line-level `@palade ignore` near the top of the file must
        // not be inferred as whole-file scope just because of its position.
        if (annotation.fileLevel) {
          ignoredFiles.push(manifest.path)
        } else {
          ignoredLines.push({ filePath: manifest.path, startLine: annotation.line })
        }
      } else if (annotation.type === 'review' && annotation.value) {
        reviewRequests.push({
          filePath: manifest.path,
          line: annotation.line,
          reason: annotation.value,
        })
      } else if (annotation.type === 'focus' && annotation.value) {
        focusRequests.push({
          filePath: manifest.path,
          line: annotation.line,
          domain: annotation.value,
        })
      }
    }
  }

  return { reviewRequests, focusRequests, ignoredFiles, ignoredLines }
}

export function applyLineIgnores(
  findings: AgentFinding[],
  ignoredLines: { filePath: string; startLine: number }[]
): AgentFinding[] {
  if (ignoredLines.length === 0) return findings
  const norm = (p: string) => p.replace(/^\.?\/+/, '')
  return findings.filter((f) => {
    if (!f.filePath || f.lineStart === undefined) return true
    return !ignoredLines.some(
      (il) =>
        norm(il.filePath) === norm(f.filePath!) &&
        f.lineStart! <= il.startLine + 1 &&
        (f.lineEnd ?? f.lineStart!) >= il.startLine
    )
  })
}
