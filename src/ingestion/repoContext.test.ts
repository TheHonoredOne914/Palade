import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { buildRepoContext, renderRepoContext, type RepoContext } from './repoContext.js'
import type { CodeChunk, FileManifest } from './types.js'

function manifest(path: string, importers: string[] = []): FileManifest {
  return {
    path,
    absolutePath: '/project/' + path,
    language: 'typescript',
    sizeBytes: 100,
    linesOfCode: 10,
    annotations: [],
    lastModified: new Date(),
    importers,
  }
}

function chunk(filePath: string, content: string): CodeChunk {
  return {
    id: filePath + ':chunk',
    filePath,
    startLine: 1,
    endLine: content.split('\n').length,
    content,
    tokenCount: 10,
    language: 'typescript',
  }
}

// projectRoot with no package.json — publicApiFiles/isLibrary/validatorDeps stay empty
const NO_PKG_ROOT = join(tmpdir(), 'palade-repoctx-nonexistent')

describe('ingestion/repoContext', () => {
  it('detects an A<->B cycle exactly once and no cycles in an acyclic graph', async () => {
    // a.ts imports b.ts and vice versa: b.ts has importer a.ts, a.ts has importer b.ts
    const cyclic = [manifest('a.ts', ['b.ts']), manifest('b.ts', ['a.ts'])]
    const ctx = await buildRepoContext(cyclic, [], NO_PKG_ROOT)
    expect(ctx.dependencyCycles).toHaveLength(1)
    expect([...ctx.dependencyCycles[0]].sort()).toEqual(['a.ts', 'b.ts'])

    // acyclic: a -> b -> c
    const acyclic = [manifest('a.ts'), manifest('b.ts', ['a.ts']), manifest('c.ts', ['b.ts'])]
    const ctx2 = await buildRepoContext(acyclic, [], NO_PKG_ROOT)
    expect(ctx2.dependencyCycles).toHaveLength(0)
  })

  it('testedBy keeps only source files with test importers and excludes test files as subjects', async () => {
    const manifests = [
      manifest('src/foo.ts', ['src/foo.test.ts', 'src/bar.ts']),
      manifest('src/bar.ts', []),
      // test file that is itself imported by another test — must not appear as a subject
      manifest('src/helpers.test.ts', ['src/foo.test.ts']),
      manifest('src/foo.test.ts', []),
    ]
    const ctx = await buildRepoContext(manifests, [], NO_PKG_ROOT)
    expect(ctx.testedBy).toEqual({ 'src/foo.ts': ['src/foo.test.ts'] })
  })

  it('re-export closure from package.json main reaches barrel targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'palade-repoctx-'))
    tempDirs.push(root)
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', main: './dist/index.js' })
    )
    const manifests = [manifest('src/index.ts'), manifest('src/core.ts'), manifest('src/other.ts')]
    const chunks = [
      chunk('src/index.ts', `export { run } from './core.js'\n`),
      chunk('src/core.ts', `export function run() {}\n`),
      chunk('src/other.ts', `export const unused = 1\n`),
    ]
    const ctx = await buildRepoContext(manifests, chunks, root)
    expect(ctx.isLibrary).toBe(true)
    expect(ctx.publicApiFiles).toContain('src/index.ts')
    expect(ctx.publicApiFiles).toContain('src/core.ts')
    expect(ctx.publicApiFiles).not.toContain('src/other.ts')
  })

  it('moduleGlobals detects column-0 new Map/Set, sets hasCleanup, ignores indented declarations', async () => {
    const manifests = [manifest('src/cache.ts'), manifest('src/tidy.ts'), manifest('src/fn.ts')]
    const chunks = [
      chunk('src/cache.ts', `const routeMap = new Map<string, string>()\n`),
      chunk('src/tidy.ts', `export const seen = new Set()\nfunction gc() { seen.clear() }\n`),
      chunk('src/fn.ts', `function f() {\n  const local = new Map()\n}\n`),
    ]
    const ctx = await buildRepoContext(manifests, chunks, NO_PKG_ROOT)
    expect(ctx.moduleGlobals).toEqual([
      { file: 'src/cache.ts', name: 'routeMap', kind: 'Map', hasCleanup: false },
      { file: 'src/tidy.ts', name: 'seen', kind: 'Set', hasCleanup: true },
    ])
  })

  it('renderRepoContext returns empty string for an all-empty context', () => {
    const empty: RepoContext = {
      dependencyCycles: [],
      testedBy: {},
      publicApiFiles: [],
      isLibrary: false,
      buildTimeFiles: [],
      validatorDeps: [],
      moduleGlobals: [],
    }
    expect(renderRepoContext(empty)).toBe('')
  })
})

const tempDirs: string[] = []
afterAll(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true })
  }
})
