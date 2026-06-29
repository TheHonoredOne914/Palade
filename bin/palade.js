#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const scriptPath = resolve(scriptDir, '../dist/cli/index.js')

if (!existsSync(scriptPath)) {
  console.error('Palade is not built. Run `npm run build` first.')
  process.exit(1)
}

const args = process.argv.slice(2)
try {
  const result = spawnSync('node', [scriptPath, ...args], { stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } })
  if (result.status !== null) {
    process.exit(result.status)
  }
} catch {
  process.exit(1)
}
