import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { walkProject } from './walker.js'

describe('walkProject importer resolution', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'palade-walker-'))
    await mkdir(join(root, 'src'), { recursive: true })
    // ESM TypeScript convention: specifier says .js, file on disk is .ts
    await writeFile(join(root, 'src', 'a.ts'), `import { b } from './b.js'\nexport const a = b\n`)
    await writeFile(join(root, 'src', 'b.ts'), `export const b = 1\n`)
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("resolves ESM './x.js' specifiers to the x.ts manifest so importers is populated", async () => {
    const manifests = await walkProject(root, { projectRoot: root })
    const b = manifests.find((m) => m.path === 'src/b.ts')
    expect(b).toBeDefined()
    expect(b!.importers).toContain('src/a.ts')
  })
})
