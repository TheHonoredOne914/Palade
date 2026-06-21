#!/usr/bin/env node
const { execFileSync } = require('child_process')
const { resolve } = require('path')
const { existsSync } = require('fs')

const scriptPath = resolve(__dirname, '../dist/cli/index.js')

if (!existsSync(scriptPath)) {
  console.error('Palade is not built. Run `npm run build` first.')
  process.exit(1)
}

const args = process.argv.slice(2)
try {
  execFileSync(process.execPath, [scriptPath, ...args], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' }
  })
} catch {
  process.exit(1)
}
