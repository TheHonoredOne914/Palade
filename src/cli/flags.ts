/**
 * Long flag name -> the exact commander flag string (`--name <placeholder>`)
 * registered for it in cli/index.ts, for every CLI option that takes a
 * value. Single source of truth for two things that used to drift
 * independently: cli/index.ts's `.option(...)` registrations (which import
 * and pass these strings as their first argument) and VALUE_FLAGS below
 * (derived from the same keys) — used by the TUI's autocomplete
 * (useCommandRunner.ts) to know whether the flag just typed expects a value
 * next (uicli-004).
 */
export const VALUE_FLAG_STRINGS: Record<string, string> = {
  config: '--config <path>',
  target: '--target <name>',
  dir: '--dir <path>',
  file: '--file <path>',
  glob: '--glob <pattern>',
  mode: '--mode <mode>',
  depth: '--depth <n>',
  format: '--format <formats>',
  base: '--base <branch>',
  sensitivity: '--sensitivity <level>',
  days: '--days <number>',
  set: '--set <key=value>',
}

export const VALUE_FLAGS = new Set(Object.keys(VALUE_FLAG_STRINGS))
