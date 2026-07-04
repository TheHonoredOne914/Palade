import chalk from 'chalk'
import { theme } from './theme.js'
import { sectionBox } from './layout.js'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function launchSettingsUI(projectRoot: string): Promise<void> {
  console.log(
    sectionBox(
      'Settings',
      [
        `  ${theme.dim('Configure Palade for this project.')}`,
        `  ${theme.dim('Please manually edit:')} ${chalk.cyan('.palade/palade.config.ts')}`,
        `  ${theme.dim('The interactive UI was removed in favor of direct file editing (Ponytail YAGNI).')}`,
      ].join('\n')
    )
  )
}

function envStatus(envVar: string): string {
  return process.env[envVar] ? chalk.hex('#10B981')('● set') : chalk.hex('#EF4444')('○ not set')
}

async function writeConfigPatch(
  projectRoot: string,
  patch: Record<string, unknown>
): Promise<void> {
  const configPath = join(projectRoot, '.palade', 'palade.config.ts')
  let existing: Record<string, unknown> = {}
  let hasExistingObject = false
  let fileExists = false
  try {
    const content = await readFile(configPath, 'utf-8')
    fileExists = true
    // Extract the object from export default { ... }
    const match = content.match(/export\s+default\s+(\{[\s\S]*\})\s*$/)
    if (match) {
      // Convert TS-ish object literal to JSON. This only handles the simple
      // shape that generateConfigString produces (unquoted keys, single-quoted
      // strings, no template literals or comments). If parsing fails we leave
      // existing empty and rewrite the file from the patch alone rather than
      // risking silent corruption of hand-written configs.
      const jsonStr = match[1]
        // Convert each single-quoted TS string to a properly-escaped JSON
        // string: un-escape `\'` back to a literal apostrophe (it was only
        // escaped to satisfy the single-quote delimiter), then escape any
        // literal `"` for the double-quote delimiter JSON requires. A
        // blanket '->" replace instead turns `\'` into `\"`, which
        // JSON.parse silently decodes as a literal `"` \u2014 corrupting the
        // value instead of failing loudly.
        .replace(/'((?:\\.|[^'\\])*)'/g, (_, inner: string) => {
          const unescaped = inner.replace(/\\'/g, "'")
          return `"${unescaped.replace(/"/g, '\\"')}"`
        })
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
        .replace(/,\s*([}\]])/g, '$1')
      try {
        const parsed = JSON.parse(jsonStr)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>
          hasExistingObject = true
        }
      } catch {
        // Non-trivial config — we cannot safely round-trip it.
        hasExistingObject = false
      }
    }
  } catch {
    // No existing config
  }

  // If we couldn't safely parse the prior config but the file exists, warn the user
  // and abort. Their manual edits outside the patch cannot be safely preserved.
  if (fileExists && !hasExistingObject) {
    console.log()
    console.log(
      theme.error('  ✗  Cannot safely modify complex .palade/palade.config.ts automatically.')
    )
    console.log(theme.dim('     Please edit the configuration file manually.'))
    return
  }

  // Deep merge patch into existing
  const merged = deepMerge(existing, patch)
  await writeFile(configPath, generateConfigString(merged), 'utf-8')
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const srcVal = source[key]
    const tgtVal = result[key]
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>)
    } else {
      result[key] = srcVal
    }
  }
  return result
}

function generateConfigString(patch: Record<string, unknown>): string {
  const json = JSON.stringify(patch, null, 2)
  // Remove quotes from keys, then convert each double-quoted JSON string to a
  // single-quoted TS string — escaping any embedded single quotes FIRST. (The
  // previous order tried to escape quotes in already-single-quoted values,
  // which never existed yet, so an apostrophe in a value produced invalid TS.)
  return `// palade.config.ts — managed by 'palade settings'
// Edit manually or run 'palade settings' to update

export default ${json
    .replace(/"([^"]+)":/g, '$1:')
    .replace(
      /"((?:[^"\\]|\\.)*)"/g,
      (_, v: string) => `'${v.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`
    )}
`
}

const DEFAULT_IGNORE_CONTENT = `node_modules/
dist/
build/
.git/
*.lock
*.min.js
*.min.css
coverage/
.palade/
`
