# Palade Audit Pipeline

Multi-agent audit orchestrator for Palade repo.

## Cost Rules
- No agent double-reads source. Structured summaries only.
- Opus: dispatch/triage only. Never analyze code.
- Haiku: mechanical sweeps (inventory, greps, lint).
- Sonnet: judgment (defect confirmation, dedup, fixes).

## Scope Exclusions (never audit)
- `src/vulnerable.ts` (deliberate vulnerability fixture)
- `*.test.ts` / eval/fixture dirs (test doubles)
- Any finding in these = auto-drop.

## Phases

### Phase 1 — Recon (Haiku, parallel)
- Full `src/` file inventory (LOC, exports)
- Grep: TODO/FIXME/@ts-ignore/any/console.log/hardcoded caps/empty catch/unused exports
- tsc + eslint output as `{file, line, rule, message}`

### Phase 2 — Deep Audit (Sonnet, parallel per subsystem)
Subsystems: `orchestrator/`, `agents/`, `providers/`, `scorer/`, `ui/` + `cli/`
Hunt: parallel systems diverging silently, format/keyword checks replacing real validation, dead code never wired, hardcoded limits.

**Review lenses (apply all three, inline):**
- **Blunt:** one flat sentence — what breaks, where, trigger. No "might."
- **Architect:** boundary violations, duplicate sources of truth, drift-prone wiring.
- **Pragmatist:** real & fixable? Kill theoretical purity. Minimal change.

### Phase 3 — Triage (Opus)
Merge JSON, dedup by `(file, class, claim)`, drop excluded scope, sort severity→confidence.
Present compact table: `id | severity | file:line | class | claim | fix_sketch`. STOP.

### Phase 4 — Fix (Sonnet, approved IDs only)
Per finding: minimal change, run `tsc --noEmit` + relevant `vitest`, return `{id, status, diff_summary, tests_pass}`.

## Finding Schema
```json
{
  "id": "subsystem-NNN",
  "file": "src/...",
  "line": 0,
  "severity": "critical|high|medium|low",
  "class": "logic|security|deadcode|divergence|fake-validation|hardcoded|perf|types|test",
  "claim": "one flat sentence",
  "evidence": "<=2 lines code quoted",
  "lenses": ["blunt","architect","pragmatist"],
  "fix_sketch": "minimal change",
  "confidence": "high|medium|low"
}
```
