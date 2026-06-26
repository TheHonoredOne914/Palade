import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { CustomAgentDefinitionSchema, type CustomAgentDefinition } from './schema.js'
import { PaladeConfigError } from '../../errors/types.js'

const AGENTS_FILE = 'palade.agents.ts'

export async function loadCustomAgents(projectRoot: string): Promise<CustomAgentDefinition[]> {
  const filePath = resolve(projectRoot, AGENTS_FILE)

  if (!existsSync(filePath)) {
    return []
  }

  let raw: unknown
  try {
    const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`
    const mod = await import(fileUrl)
    raw = mod.default ?? mod
  } catch (e) {
    // A palade.agents.ts that throws at import time (syntax error, bad import,
    // undefined symbol) is a config error the user must fix before any review
    // runs. Fail fast here rather than silently shipping a review that's
    // missing the user's custom domain coverage.
    const msg = e instanceof Error ? e.message : String(e)
    throw new PaladeConfigError(
      `Failed to import ${AGENTS_FILE}: ${msg}`,
      'agents',
      `Fix the error in ${AGENTS_FILE} or delete the file to skip custom agents.`
    )
  }

  // Fail fast on a malformed export: returning [] here would silently strip
  // the user's intended agents and produce a review lacking that domain
  // coverage with no signal. Same rationale as the per-entry validation below.
  if (!Array.isArray(raw)) {
    throw new PaladeConfigError(
      `${AGENTS_FILE} must export an array of agent definitions (found ${typeof raw}).`,
      'agents',
      `Ensure ${AGENTS_FILE} has \`export default [ { name, domain, systemPrompt }, ... ]\`.`
    )
  }

  const agents: CustomAgentDefinition[] = []
  for (let i = 0; i < raw.length; i++) {
    const result = CustomAgentDefinitionSchema.safeParse(raw[i])
    if (result.success) {
      agents.push(result.data)
    } else {
      // A broken entry (missing/empty systemPrompt, colliding name) must abort
      // the run, not be silently dropped. Burning tokens on the swarm only to
      // discover the intended agent never ran is exactly the failure mode the
      // fail-fast contract exists to prevent.
      const issues = result.error.issues.map((iss) => {
        const path = iss.path.join('.')
        return path ? `${path}: ${iss.message}` : iss.message
      }).join('; ')
      throw new PaladeConfigError(
        `${AGENTS_FILE} entry at index ${i} is invalid: ${issues}`,
        'agents',
        `Edit ${AGENTS_FILE} entry ${i} to satisfy the schema (name, domain, systemPrompt required; name must not collide with a built-in).`
      )
    }
  }

  return agents
}

