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
    language: name.endsWith('.py') ? 'python' : 'typescript',
    sizeBytes: Buffer.byteLength(content),
    linesOfCode: content.split('\n').length,
    annotations: [],
    lastModified: new Date()
  }
}

describe('ingestion/chunker', () => {
  it('produces a single chunk for a class with multiple methods', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `class UserService {
  async getUser(id: string) { return db.find(id) }
  async createUser(data: any) { return db.insert(data) }
  async deleteUser(id: string) { return db.remove(id) }
}`
      const manifest = await createTmpFile('service.ts', code, dir)
      const chunks = await chunkFiles([manifest])

      const classChunks = chunks.filter(c => c.symbolName === 'UserService')
      expect(classChunks).toHaveLength(1)

      const allMethods = chunks.filter(c =>
        c.symbolName === 'getUser' || c.symbolName === 'createUser' || c.symbolName === 'deleteUser'
      )
      expect(allMethods).toHaveLength(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('chunks standalone functions independently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `function a() { return 1 }
function b() { return 2 }`
      const manifest = await createTmpFile('fns.ts', code, dir)
      const chunks = await chunkFiles([manifest])

      expect(chunks).toHaveLength(2)
      expect(chunks[0].symbolName).toBe('a')
      expect(chunks[1].symbolName).toBe('b')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does not double-count class body in method chunks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `class Parser {
  parse(input: string) { return JSON.parse(input) }
  validate(data: unknown) { return !!data }
}`
      const manifest = await createTmpFile('parser.ts', code, dir)
      const chunks = await chunkFiles([manifest])

      const classChunk = chunks.find(c => c.symbolName === 'Parser')
      expect(classChunk).toBeDefined()

      const methodChunks = chunks.filter(c =>
        c.symbolName === 'parse' || c.symbolName === 'validate'
      )
      expect(methodChunks).toHaveLength(0)

      const totalTokens = chunks.reduce((s, c) => s + c.tokenCount, 0)
      const classTokens = classChunk!.tokenCount
      expect(totalTokens).toBe(classTokens)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('produces a single chunk for a Python class with methods', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'palade-chunker-'))
    try {
      const code = `class UserService:
    def get_user(self, id):
        return db.find(id)

    def create_user(self, data):
        return db.insert(data)

    def delete_user(self, id):
        return db.remove(id)`
      const manifest = await createTmpFile('service.py', code, dir)
      const chunks = await chunkFiles([manifest])

      const classChunks = chunks.filter(c => c.symbolName === 'UserService')
      expect(classChunks).toHaveLength(1)

      const methodChunks = chunks.filter(c =>
        c.symbolName === 'get_user' || c.symbolName === 'create_user' || c.symbolName === 'delete_user'
      )
      expect(methodChunks).toHaveLength(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
