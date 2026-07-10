import { readFile } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { CodeChunk, FileManifest } from './types.js'

export interface RepoContext {
  dependencyCycles: string[][] // each cycle = list of file paths forming the cycle
  testedBy: Record<string, string[]> // source file -> test files that import it
  publicApiFiles: string[] // files exposed via package.json exports/main/module/types/bin, plus transitive re-export targets reachable from those entries
  isLibrary: boolean
  buildTimeFiles: string[]
  validatorDeps: string[]
  moduleGlobals: Array<{ file: string; name: string; kind: 'Map' | 'Set'; hasCleanup: boolean }>
}

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/
const TEST_SEGMENT_RE = /(^|\/)(__tests__|tests|test|e2e)(\/|$)/

function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path) || TEST_SEGMENT_RE.test(path)
}

const VALIDATOR_LIBS = [
  'zod',
  'joi',
  'yup',
  'ajv',
  'valibot',
  'class-validator',
  'express-validator',
  'sanitize-html',
  'xss',
  'dompurify',
  'validator',
]

const CONFIG_FILE_RE = /(^|\/)[^/]*\.config\.[cm]?[jt]s$/
const ESLINTRC_RE = /(^|\/)\.eslintrc/

// Module-scope `new Map()`/`new Set()` heuristic: only matches declarations
// starting at column 0, since indented ones are almost always local/function
// scope, not module-level state that can leak across the process lifetime.
const MODULE_GLOBAL_RE =
  /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*new\s+(Map|Set)\b/

/** Detects cycles in a directed graph (adjacency list) via iterative DFS with color marking. */
function findCycles(adjacency: Map<string, Set<string>>): string[][] {
  // Colors: undefined = unvisited (white), GRAY = on current DFS path, BLACK = done.
  const GRAY = 1,
    BLACK = 2
  const color = new Map<string, number>()
  const cycles: string[][] = []
  const seenCycles = new Set<string>()

  function normalize(cycle: string[]): string {
    // Rotate so the lexicographically smallest path element is first, to dedupe
    // cycles that are the same loop discovered starting from different nodes.
    let minIdx = 0
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[minIdx]) minIdx = i
    }
    const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
    return rotated.join('>')
  }

  for (const start of adjacency.keys()) {
    if (color.get(start) !== undefined) continue
    // stack of [node, iterator index into its neighbor array, path-so-far]
    const stack: Array<{ node: string; neighbors: string[]; idx: number }> = []
    color.set(start, GRAY)
    stack.push({ node: start, neighbors: [...(adjacency.get(start) ?? [])], idx: 0 })
    const path: string[] = [start]

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      if (frame.idx >= frame.neighbors.length) {
        color.set(frame.node, BLACK)
        stack.pop()
        path.pop()
        continue
      }
      const next = frame.neighbors[frame.idx++]
      const nextColor = color.get(next)
      if (nextColor === GRAY) {
        // Back edge — extract the cycle from where `next` first appears in path.
        const cycleStart = path.indexOf(next)
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart)
          const key = normalize(cycle)
          if (!seenCycles.has(key)) {
            seenCycles.add(key)
            cycles.push(cycle)
          }
        }
      } else if (nextColor === undefined) {
        color.set(next, GRAY)
        path.push(next)
        stack.push({ node: next, neighbors: [...(adjacency.get(next) ?? [])], idx: 0 })
      }
      if (cycles.length >= 10) return cycles
    }
  }

  return cycles
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out)
  }
}

/** Normalizes a package.json entry path to manifest-path candidates worth trying. */
function candidatesFor(raw: string): string[] {
  const stripped = raw.replace(/^\.\//, '')
  const candidates = [stripped]
  if (stripped.startsWith('dist/')) {
    const srcVariant = 'src/' + stripped.slice('dist/'.length).replace(/\.[cm]?js$/, '.ts')
    candidates.push(srcVariant)
  }
  return candidates
}

const REEXPORT_RE = /export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g

/** Resolves a relative re-export specifier against the file that contains it, to a manifest path. */
function resolveReexport(
  specifier: string,
  fromFile: string,
  manifestPaths: Set<string>
): string | null {
  if (!specifier.startsWith('.')) return null
  const dir = posix.dirname(fromFile)
  const resolved = posix.normalize(posix.join(dir, specifier))
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx']
  for (const ext of extensions) {
    if (manifestPaths.has(resolved + ext)) return resolved + ext
  }
  // ESM TypeScript convention: a `./core.js` specifier refers to `core.ts` on disk.
  const jsStripped = resolved.replace(/\.[cm]?jsx?$/, '')
  if (jsStripped !== resolved) {
    for (const ext of ['.ts', '.tsx']) {
      if (manifestPaths.has(jsStripped + ext)) return jsStripped + ext
    }
  }
  if (manifestPaths.has(resolved + '/index.ts')) return resolved + '/index.ts'
  return null
}

async function buildPublicApi(
  projectRoot: string,
  manifestPaths: Set<string>,
  chunksByFile: Map<string, CodeChunk[]>
): Promise<{ publicApiFiles: string[]; isLibrary: boolean }> {
  let pkg: Record<string, unknown>
  try {
    const raw = await readFile(join(projectRoot, 'package.json'), 'utf-8')
    pkg = JSON.parse(raw)
  } catch {
    return { publicApiFiles: [], isLibrary: false }
  }

  const isLibrary = (pkg.exports !== undefined || pkg.main !== undefined) && pkg.bin === undefined

  const rawEntries: string[] = []
  for (const field of ['main', 'module', 'types', 'exports', 'bin']) {
    if (pkg[field] !== undefined) collectStrings(pkg[field], rawEntries)
  }

  const entries = new Set<string>()
  for (const raw of rawEntries) {
    for (const candidate of candidatesFor(raw)) {
      if (manifestPaths.has(candidate)) entries.add(candidate)
    }
  }

  // BFS through re-export edges from each entry file. Collect up to 60 so the
  // renderer (which shows 30) can emit an honest "... and N more" instead of
  // silently pretending the public API ends at the cap.
  const reached = new Set<string>(entries)
  const queue = [...entries]
  while (queue.length > 0 && reached.size < 60) {
    const file = queue.shift()!
    for (const chunk of chunksByFile.get(file) ?? []) {
      REEXPORT_RE.lastIndex = 0
      for (const m of chunk.content.matchAll(REEXPORT_RE)) {
        const target = resolveReexport(m[1], file, manifestPaths)
        if (target && !reached.has(target)) {
          reached.add(target)
          queue.push(target)
          if (reached.size >= 60) break
        }
      }
    }
  }

  return { publicApiFiles: [...reached].slice(0, 60), isLibrary }
}

export async function buildRepoContext(
  manifests: FileManifest[],
  chunks: CodeChunk[],
  projectRoot: string
): Promise<RepoContext> {
  // dependencyCycles — edges: importer -> importee (importer depends on importee).
  const adjacency = new Map<string, Set<string>>()
  for (const m of manifests) {
    for (const importer of m.importers ?? []) {
      if (!adjacency.has(importer)) adjacency.set(importer, new Set())
      adjacency.get(importer)!.add(m.path)
    }
  }
  const dependencyCycles = findCycles(adjacency).slice(0, 10)

  // testedBy
  const testedBy: Record<string, string[]> = {}
  for (const m of manifests) {
    if (isTestFile(m.path)) continue
    const testImporters = (m.importers ?? []).filter(isTestFile)
    if (testImporters.length > 0) testedBy[m.path] = testImporters
  }

  // publicApiFiles + isLibrary
  const manifestPaths = new Set(manifests.map((m) => m.path))
  const chunksByFile = new Map<string, CodeChunk[]>()
  for (const c of chunks) {
    if (!chunksByFile.has(c.filePath)) chunksByFile.set(c.filePath, [])
    chunksByFile.get(c.filePath)!.push(c)
  }
  const { publicApiFiles, isLibrary } = await buildPublicApi(
    projectRoot,
    manifestPaths,
    chunksByFile
  )

  // buildTimeFiles
  const buildTimeFiles = manifests
    .map((m) => m.path)
    .filter((p) => CONFIG_FILE_RE.test(p) || ESLINTRC_RE.test(p) || p.startsWith('scripts/'))

  // validatorDeps
  let validatorDeps: string[] = []
  try {
    const raw = await readFile(join(projectRoot, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw)
    const deps = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ])
    validatorDeps = VALIDATOR_LIBS.filter((lib) => deps.has(lib))
  } catch {
    // no package.json / unparsable — leave empty
  }

  // moduleGlobals
  const moduleGlobals: RepoContext['moduleGlobals'] = []
  for (const [file, fileChunks] of chunksByFile) {
    if (isTestFile(file)) continue
    const fullContent = fileChunks.map((c) => c.content).join('\n')
    for (const chunk of fileChunks) {
      for (const line of chunk.content.split('\n')) {
        const match = line.match(MODULE_GLOBAL_RE)
        if (match) {
          const name = match[1]
          moduleGlobals.push({
            file,
            name,
            kind: match[2] as 'Map' | 'Set',
            // ponytail: substring check — matches comments/strings too; AST
            // scan if false "has cleanup" verdicts start hiding real leaks.
            hasCleanup:
              fullContent.includes(`${name}.delete(`) || fullContent.includes(`${name}.clear(`),
          })
        }
      }
    }
    if (moduleGlobals.length >= 15) break
  }

  return {
    dependencyCycles,
    testedBy,
    publicApiFiles,
    isLibrary,
    buildTimeFiles,
    validatorDeps,
    moduleGlobals: moduleGlobals.slice(0, 15),
  }
}

function renderCappedList(items: string[], cap: number): string {
  const shown = items.slice(0, cap)
  const lines = shown.map((i) => `  - ${i}`)
  if (items.length > cap) lines.push(`  ... and ${items.length - cap} more`)
  return lines.join('\n')
}

export function renderRepoContext(ctx: RepoContext): string {
  const sections: string[] = []

  if (ctx.dependencyCycles.length > 0) {
    const lines = ctx.dependencyCycles
      .slice(0, 10)
      .map((cycle) => `  - ${[...cycle, cycle[0]].join(' -> ')}`)
    sections.push(`DEPENDENCY CYCLES (defects — report under architecture):\n${lines.join('\n')}`)
  }

  const testedEntries = Object.entries(ctx.testedBy)
  if (testedEntries.length > 0) {
    const lines = testedEntries
      .slice(0, 40)
      .map(([file, tests]) => `  - ${file} (tested by: ${tests.join(', ')})`)
    if (testedEntries.length > 40) lines.push(`  ... and ${testedEntries.length - 40} more`)
    sections.push(
      `FILES WITH TEST COVERAGE (do not report these as untested):\n${lines.join('\n')}`
    )
  }

  if (ctx.publicApiFiles.length > 0) {
    sections.push(
      `PUBLIC API FILES (exports here are consumed by library users — do not report as dead code):\n${renderCappedList(ctx.publicApiFiles, 30)}`
    )
  }

  sections.push(
    `PROJECT TYPE: ${ctx.isLibrary ? 'library (unused-looking exports may be public API)' : 'application'}`
  )

  if (ctx.buildTimeFiles.length > 0) {
    sections.push(
      `BUILD-TIME FILES (not runtime-reachable — deprioritize injection/XSS findings here):\n${renderCappedList(ctx.buildTimeFiles, ctx.buildTimeFiles.length)}`
    )
  }

  if (ctx.validatorDeps.length > 0) {
    sections.push(`VALIDATION LIBRARIES PRESENT: ${ctx.validatorDeps.join(', ')}`)
  }

  if (ctx.moduleGlobals.length > 0) {
    const lines = ctx.moduleGlobals
      .slice(0, 15)
      .map(
        (g) =>
          `  - ${g.file}: ${g.name} (${g.kind}, ${g.hasCleanup ? 'has delete/clear' : 'no delete/clear found'})`
      )
    sections.push(
      `MODULE-LEVEL COLLECTIONS (check for unbounded growth; entries without cleanup are leak candidates):\n${lines.join('\n')}`
    )
  }

  // Only PROJECT TYPE is unconditional; if nothing else has content, treat as empty.
  const hasRealContent =
    ctx.dependencyCycles.length > 0 ||
    testedEntries.length > 0 ||
    ctx.publicApiFiles.length > 0 ||
    ctx.buildTimeFiles.length > 0 ||
    ctx.validatorDeps.length > 0 ||
    ctx.moduleGlobals.length > 0
  if (!hasRealContent) return ''

  return `=== REPOSITORY CONTEXT (facts derived from the whole repo — trust these over per-chunk guesses) ===\n${sections.join('\n')}\n=== END REPOSITORY CONTEXT ===`
}
