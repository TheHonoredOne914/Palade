import { readFile } from 'node:fs/promises'
import type { Annotation, FileManifest } from './types.js'

const REVIEW_RE = /\/\/\s*@palade\s+review\s*:\s*(.+)/i
const FOCUS_RE = /\/\/\s*@palade\s+focus\s*:\s*(.+)/i
const IGNORE_RE = /\/\/\s*@palade\s+ignore/i
const PY_REVIEW_RE = /#\s*@palade\s+review\s*:\s*(.+)/i
const PY_FOCUS_RE = /#\s*@palade\s+focus\s*:\s*(.+)/i
const PY_IGNORE_RE = /#\s*@palade\s+ignore/i

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
      if (line.match(PY_IGNORE_RE)) {
        annotations.push({ type: 'ignore', line: lineNum })
        continue
      }
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
    if (line.match(IGNORE_RE)) {
      annotations.push({ type: 'ignore', line: lineNum })
    }
  }

  return annotations
}

export function parseAnnotations(manifests: FileManifest[]): Promise<Map<string, Annotation[]>> {
  return parseAnnotationsAsync(manifests)
}

async function parseAnnotationsAsync(manifests: FileManifest[]): Promise<Map<string, Annotation[]>> {
  const map = new Map<string, Annotation[]>()
  for (const manifest of manifests) {
    const isPython = manifest.language === 'python'
    const annotations = await parseFileAsync(manifest.absolutePath, isPython)
    if (annotations.length > 0) {
      map.set(manifest.path, annotations)
    }
  }
  return map
}
