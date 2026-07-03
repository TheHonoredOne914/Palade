import { describe, it, expect } from 'vitest'
import { chunkFiles } from './chunker.js'
import type { FileManifest } from './types.js'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

async function createTmpFile(name: string, content: string, dir: string): Promise<FileManifest> {
  const absPath = join(dir, name)
  await writeFile(absPath, content, 'utf-8')
  return {
    path: name,
    absolutePath: absPath,
    language: name.endsWith('.py') ? 'python' : name.endsWith('.java') ? 'java' : 'typescript',
    sizeBytes: Buffer.byteLength(content),
    linesOfCode: content.split('\n').length,
    annotations: [],
    lastModified: new Date(),
  }
}

describe('ingestion/chunker', () => {
  it('produces chunks using bracket boundaries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = Array.from({ length: 300 }, (_, i) => `const a${i} = ${i};`).join('\n')
      const manifest = await createTmpFile('large.ts', code, dir)
      const chunks = await chunkFiles([manifest])

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].startLine).toBe(1)
      expect(chunks[0].content).toContain('const a0 = 0;')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('respects MAX_CHUNKS_PER_FILE limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      // Create a massive file to force truncation
      const code = Array.from({ length: 15000 }, (_, i) => `const a${i} = ${i};`).join('\n')
      const manifest = await createTmpFile('massive.ts', code, dir)
      const chunks = await chunkFiles([manifest])

      expect(chunks.length).toBeLessThanOrEqual(50) // MAX_CHUNKS_PER_FILE is 50
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('does not miscount braces inside string literals', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `
function greet(name: string) {
  const msg = "opening brace: { and closing: }"
  return msg
}
function next() {
  return 1
}
`
      // using .java to force bracket chunker
      const manifest = await createTmpFile('strings.java', code, dir)
      const chunks = await chunkFiles([manifest])
      expect(
        chunks.some(
          (c) => c.content.includes('function greet') && c.content.includes('function next')
        )
      ).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not miscount braces inside template literals', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `
function build(name: string) {
  return \`Hello \${name}, here is a brace: {\`
}
`
      const manifest = await createTmpFile('template.java', code, dir)
      const chunks = await chunkFiles([manifest])
      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks[0].content).toContain('function build')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not miscount braces inside comments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `
// legacy config was { key: value }
function modern() {
  return true
}
`
      const manifest = await createTmpFile('comment.java', code, dir)
      const chunks = await chunkFiles([manifest])
      expect(chunks[0].content).toContain('function modern')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
