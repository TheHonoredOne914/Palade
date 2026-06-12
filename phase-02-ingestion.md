# PALADE — PHASE 2: Ingestion Pipeline

**Depends on:** Phase 1 complete and compiling
**Next phase:** Phase 3 — Provider Adapters

---

## What You Are Building

The codebase reading layer. Takes a project directory, respects ignore rules, walks files, semantically chunks them at function/class boundaries, resolves symbol-level scopes, traces imports, and parses inline `@palade` annotations.

After this phase: given any directory, Palade can produce a clean `CodeChunk[]` ready to send to agents.

---

## Files to Create

```
src/ingestion/
├── walker.ts
├── chunker.ts
├── symbolResolver.ts
├── dependencyTracer.ts
└── annotationParser.ts
```

---

## Core Types

Define these in `src/ingestion/types.ts` and export from each file as needed:

```ts
export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'unknown'

export interface Annotation {
  type: 'review' | 'focus' | 'ignore'
  value?: string      // the reason string after @palade review: ...
  line: number
}

export interface FileManifest {
  path: string              // relative to project root
  absolutePath: string
  language: Language
  sizeBytes: number
  linesOfCode: number
  annotations: Annotation[]
  lastModified: Date
}

export interface CodeChunk {
  id: string                // `${filePath}:${startLine}-${endLine}`
  filePath: string          // relative path
  startLine: number
  endLine: number
  content: string
  symbolName?: string       // if chunk is a named function/class
  tokenCount: number        // estimated: content.length / 4
  language: Language
}

export interface ScopeOptions {
  dirs?: string[]
  files?: string[]
  globs?: string[]
  targetPaths?: string[]    // from palade.targets.ts entry array
  annotationsOnly?: boolean
  projectRoot: string
}
```

---

## Tasks

### 1. `src/ingestion/walker.ts`

```ts
export async function walkProject(
  projectRoot: string,
  scope: ScopeOptions
): Promise<FileManifest[]>
```

Implementation:
- Use the `ignore` npm package to parse `.paladeignore`
- Always apply default ignores: `node_modules`, `dist`, `build`, `.git`, `*.lock`, `*.min.js`, `*.min.css`, `coverage`, `.palade`
- If `.paladeignore` does not exist: use defaults only, no error
- Traverse with recursive `fs.readdir` (not glob for accuracy)
- Detect language from extension:
  - `.ts`, `.tsx` → `typescript`
  - `.js`, `.jsx`, `.mjs` → `javascript`
  - `.py` → `python`
  - `.go` → `go`
  - `.rs` → `rust`
  - everything else → `unknown`
- Skip `unknown` language files (binary files, images, etc.)
- Apply scope filtering AFTER collecting all files:
  - If `scope.dirs` provided: keep files whose path starts with any of those dirs
  - If `scope.files` provided: keep only those exact files
  - If `scope.globs` provided: use `glob` package to match
  - If `scope.targetPaths` provided: union with above
  - If none provided: return all non-ignored files
- Call `annotationParser.parseFile(absolutePath)` for each file → populate `annotations`
- If `scope.annotationsOnly`: filter to files that have at least one non-ignore annotation
- Return `FileManifest[]` sorted by path

### 2. `src/ingestion/chunker.ts`

```ts
export async function chunkFiles(
  manifests: FileManifest[]
): Promise<CodeChunk[]>
```

Implementation:

**For TypeScript and JavaScript** (use `tree-sitter` + `tree-sitter-typescript`/`tree-sitter-javascript`):
- Parse file content with tree-sitter
- Walk the AST, collect top-level nodes of types:
  - `function_declaration`
  - `class_declaration`
  - `export_statement` containing a function or class
  - `arrow_function` assigned to a `const` at top level
  - `method_definition` inside a class
- Each node becomes one chunk: extract its start line, end line, content
- Also extract the symbol name from the node if available
- If a node is over 6,000 estimated tokens: split it into overlapping 3,000-token sub-chunks (200-line overlap)

**For Python** (use `tree-sitter-python`):
- Collect `function_definition` and `class_definition` top-level nodes
- Same chunking logic

**For other languages + fallback**:
- Sliding window: 150 lines per chunk, 30-line overlap
- No symbol names assigned

**After chunking**:
- Any file with no chunks (e.g. small utility file) gets treated as one chunk
- Estimate `tokenCount` as `Math.ceil(content.length / 4)`
- Assign chunk `id` as `${filePath}:${startLine}-${endLine}`
- Return flat `CodeChunk[]`

### 3. `src/ingestion/symbolResolver.ts`

```ts
export async function resolveSymbol(
  symbolRef: string,          // format: "src/file.ts::FunctionName"
  projectRoot: string
): Promise<CodeChunk | null>
```

Implementation:
- Parse `symbolRef` by splitting on `::`
- Read the file, parse with tree-sitter
- Walk AST looking for a named node matching the symbol name
- If found: return it as a single `CodeChunk` (same format as chunker output)
- If not found: log warning `Symbol 'FunctionName' not found in src/file.ts`, return null

### 4. `src/ingestion/dependencyTracer.ts`

```ts
export async function traceDependencies(
  filePath: string,
  projectRoot: string,
  depth: number = 1
): Promise<string[]>
```

Implementation:
- Read file content
- Extract all local import paths using regex (do NOT use tree-sitter here — regex is sufficient and faster):
  - Match `from '[./]...` and `require('[./]...`
  - Skip `node_modules` imports (paths not starting with `.` or `/`)
- Resolve relative paths to absolute using `path.resolve`
- Convert back to relative paths from projectRoot
- Check file exists (skip if not)
- If `depth > 1`: recursively trace each dependency (dedup with a Set to prevent cycles)
- Return unique relative file paths

### 5. `src/ingestion/annotationParser.ts`

```ts
export function parseFile(absolutePath: string): Annotation[]

export function parseAnnotations(
  manifests: FileManifest[]
): Map<string, Annotation[]>
```

Implementation:
- Read file line by line
- For each line, check for annotation patterns:
  - `// @palade review: <reason>` → `{ type: 'review', value: '<reason>', line }`
  - `// @palade focus: <domain>` → `{ type: 'focus', value: '<domain>', line }`
  - `// @palade ignore` → `{ type: 'ignore', line }`
  - Same patterns with `#` prefix for Python files
  - Case-insensitive matching
- Return `Annotation[]` for that file
- `parseAnnotations` runs `parseFile` on all manifests and returns the map

---

## Acceptance Criteria

- `walkProject(projectRoot, {})` on `test-project/` returns all `.ts` files except those in `node_modules/` and `dist/`
- `chunkFiles()` on a 10-file TypeScript project returns at least 15 chunks (functions + classes)
- No chunk has `tokenCount > 6000`
- `resolveSymbol('src/utils.ts::unusedFunction', root)` returns the correct chunk
- `traceDependencies('src/routes/user.ts', root, 1)` returns the files it imports
- Annotation parser correctly identifies all 3 annotation types from both `//` and `#` comment styles
- Walker with `annotationsOnly: true` returns only files that have `@palade review` or `@palade focus` annotations (not `@palade ignore`)

---

## Rules for This Phase

- tree-sitter parsers must be initialised once and reused (not re-initialised per file)
- All file reads use `fs.promises` (async, never sync)
- Chunker never throws on malformed files — catch parse errors, fall back to sliding window
- Walker never crashes on permission errors — catch and skip inaccessible files with a warning
- All paths returned are relative to `projectRoot`, never absolute
