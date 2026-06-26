# Palade Hardening — Three-Phase Deliverables

This document is the consolidated, evidence-based deliverable for the three-phase
hardening pass. It supersedes the earlier scratch notes (`PHASE1-AUDIT.md`,
`PHASE2-FIX.md`), which had drifted from the code (they referenced an
`AGENT_MAP` symbol that was since renamed to `BUILTIN_AGENTS`).

Build: `npx tsc --noEmit` → clean. Tests: `npx vitest run` → **19 files / 119
tests passing** (was 17 / 104 at session start).

---

## Phase 1 — Audit (analysis only)

### Method note (rule 2: no fabricated findings)

The original prompt described issues from a **prior** repo state. This branch
(`production-readiness`) already contains commits addressing most of them
(e.g. `5e94f92 fix(R1): swarm timeout cancels in-flight provider requests via
AbortController`). The audit below is against the **current** code, verified by
reading each file and running the build/tests. Findings the prompt named that are
already fixed are marked **ALREADY FIXED** with the evidence, not re-claimed.

| Severity | Open against current code |
|----------|---------------------------|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 0 (one item checked and confirmed non-issue) |

### Prompt findings — status

| Prompt claim | Status | Evidence |
|---|---|---|
| Swarm timeout doesn't cancel in-flight requests | **ALREADY FIXED** | `swarm.ts:56-77` aborts per-batch controller; signal threads through `fetchWithRetry` (`base.ts:52-63,79-81`) |
| FallbackProvider silently downgrades, no signal | **ALREADY FIXED** | `router.ts:117-120` rewrites response identity; `getFallbackStats` + `review.ts`/`diff.ts` print the warning |
| Registry double-instantiates 12 agents | **ALREADY FIXED** | `registry.ts:11-21` single `BUILTIN_AGENTS` Map; `AGENT_REGISTRY` derived |
| parseFindingsResponse triple-fallback is masking a prompt problem | **ALREADY FIXED (correctly)** | `base.ts:105-179` dropped the dangerous 3rd layer; 2-layer cascade + return `[]` |
| HTML report XSS via untrusted findings | **ALREADY HANDLED** | `html.ts:57-64,223` escapeHtml on all finding-derived strings |
| scheduler.splitChunk bisects mid-function | **ALREADY FIXED** | `scheduler.ts:6-51` searches ±15% for a natural break |

### Open findings (this phase fixed all three)

- **H1 (token efficiency)** — the N× resend of chunk content across agents was
  untouched; no concrete reduction mechanism was actually implemented. The
  `cacheablePrefix` hint on `CompletionRequest` was never set by any caller and
  is non-viable cross-agent anyway (each agent has a different system prompt, so
  the shared chunk content never forms a shared cacheable prefix).
- **M1 (dead scoring code)** — `CustomAgent` computes a custom `scorePenalty`
  from `severityPenalty` overrides, but the scorer read hardcoded
  `SEVERITY_WEIGHTS[f.severity]` and ignored it, so the override feature did
  nothing.
- **M2 (fail-fast violated)** — the Phase 3 spec required a broken
  `palade.agents.ts` to fail at config load, but the loader used `safeParse` +
  `console.warn` + skip, silently dropping the user's agent.

### Token-cost quantification (real numbers)

Triage targets ~45 chunks at ~6,000 tokens/chunk. With an 8,000-token batch
limit, that's ~6 batches/agent. Per-agent input ≈ 48,000 tokens; ×6 agents ≈
**~290k input tokens of code content per full review**, dominated by the 6×
resend. (The "1.67M" figure in the stale notes double-counted chunks × batches.)
Synthesis adds ~5-10k, triage ~3k.

### "Performance" resolved

CLI, not server → performance = `palade review` wall-clock latency + per-run
LLM spend. The only CPU-bound path (walker → tree-sitter chunker) is bounded
(`MAX_TREE_SITTER_LINES=3000`, `MAX_CHUNKS_PER_FILE=50`) and runs in ~1s.
Network/LLM latency (30-120s/agent) dominates by 1-2 orders of magnitude. No CPU
hot-path worth optimizing.

---

## Phase 2 — Fixes

### M1 — Scorer honors per-finding scorePenalty
**File:** `src/scorer/calculator.ts`
**Why:** `CustomAgent` was computing custom penalties that the scorer threw away;
the `severityPenalty` config knob was dead. The scorer now uses `penaltyFor(f)`
= explicit `f.scorePenalty` if set, else the severity weight. Safe because
`parseFindingsResponse` sets a meaningful `scorePenalty` on every real finding
(default weight), so built-in findings are unaffected; only deliberate overrides
change behavior.
**Tests:** `calculator.test.ts` +2 (override-honored regression; undefined-fallback).

### H1 — Economy mode: combined multi-domain pass (opt-in)
**Files:** `src/agents/combined.ts` (new), `src/orchestrator/{swarm,types}.ts`,
`src/config/{schema,defaults}.ts`, `src/cli/commands/{review,diff}.ts`
**Why:** This is the *only* mechanism that genuinely cuts the 6× resend.
Provider prefix caching and shared-prefix dedup are non-viable here (different
system prompts per agent ⇒ no shared cacheable prefix across agents).
**Tradeoff (rule 5):** economy mode trades latency (one call must cover all
domains → slower than the fastest parallel agent) and per-domain prompt richness
(one combined prompt can't be as tuned as six) for ~6× lower code-content token
spend. Per-domain **scoring** is preserved (each finding keeps its `agentName`).
**Why opt-in (default false):** rule 1 — no silent behavior change to the default
swarm. Users set `swarm.economyMode: true` when cost > latency.
**Tests:** `combined.test.ts` (6) — domain set coverage, misattribution guard
(drops findings with invalid/missing agentName), penalty application.

### Token-efficiency tradeoff decision (the rule-5 disclosure)

Three options were evaluated for the N× resend:
1. **Provider-side prefix caching** — rejected. Each agent's system prompt
   differs, so the shared chunk content (user-message position) can never form a
   shared cacheable prefix *across* agents. Wiring `cacheablePrefix` would have
   been a fabricated claim (rule 2). Intra-agent caching is already automatic on
   Groq/Cerebras.
2. **Combined multi-domain pass** — **implemented** (H1 above). Real reduction,
   real tradeoffs, opt-in.
3. **Shared system-prompt prefix only** — rejected. No shared prefix exists to
   dedupe (prompts differ per domain).

**Traded away** for the token reduction: parallelism (latency usually rises) and
per-domain prompt specificity (one prompt serves all lenses). **Kept:**
per-domain scoring, synthesis pipeline, parallelism in the default (non-economy)
path.

### Test output (actual)

```
 Test Files  19 passed (19)
      Tests  119 passed (119)
   Duration  17.40s
```
`npx tsc --noEmit` → exit 0.

---

## Phase 3 — Editable agent swarms

This was substantially implemented on the branch before this session. This phase
closed the one genuine gap against the spec and documented it.

### Design decisions (already made on the branch; verified sound)

- **`AgentName` widened to `string & {}`** (`base.ts:9-16`) — keeps IDE
  autocomplete for the six built-ins while allowing arbitrary custom names.
  Every call site was audited: reporters/TUI pattern-match on severity (a closed
  union), not on `AgentName`, so widening `AgentName` is safe. The scorer's
  `ScoreCategory` stays a closed union because category scores are defined only
  for the six built-in domains — custom agents contribute to the total penalty
  but not to a per-category bar (documented limitation, see gaps).
- **Custom agents run through the same provider/synthesis pipeline** as
  built-ins (`custom/agent.ts`) — for scoring consistency. They are NOT
  pluggable with their own provider config. Justified: the `Brick`-style
  scoring and synthesis both assume a unified pipeline; per-agent providers
  would fragment fallback/quota handling for no real user benefit.
- **`getAgentsForMode` merges custom + built-in** into one map
  (`registry.ts:43-55`); `agentOverrides` resolves against the merged set so a
  user can run only their custom agents via mode config.

### M2 fix — fail-fast at config load (the spec requirement)
**File:** `src/agents/custom/loader.ts`
**Why:** The spec explicitly required a broken `systemPrompt` (or malformed file)
to fail at config load, not silently skip and burn a whole review run missing
the intended domain. The loader now throws `PaladeConfigError` (field `agents`)
on: import failure, non-array export, or any invalid entry. The error renders
cleanly via the existing `handleFatalError` path (`handler.ts:21-26`).
**Tests:** `loader.test.ts` (7) — valid load, no-file, non-array throw,
empty-prompt throw, name-collision throw, syntax-error throw, field=`agents`.

### README
`README.md` gains a "Custom Agents" section after "Custom Targets" with a worked
`palade.agents.ts` example (two agents, one with `severityPenalty` overrides),
the context-injection guarantee, and the fail-fast contract. `palade init`
already scaffolds a starter `palade.agents.ts` (verified `init.ts:116-122`).

---

## Final summary — what is NOT production-ready (honest gap list)

These are real gaps I did **not** close in this pass. Listing them honestly per
the deliverable format rather than claiming full coverage.

1. **No end-to-end / integration test of a real review run.** Every test is a
   unit test with stubbed providers. The full pipeline (walker → chunker →
   triage → swarm → synthesis → score → report) has never been exercised in CI
   against a live or mocked provider end-to-end. A broken wire between two
   units (e.g. a field renamed in one place but not the next) would not be
   caught. **Highest-value missing test.**

2. **Economy mode (H1) is implemented and unit-tested but not integration-tested
   against a real provider.** The `CombinedAnalyzer.analyze` path (which calls
   `getProvider`) has no test that exercises it through the router, only the
   pure `attributeFindings` helper. A provider-integration test would confirm
   the combined prompt actually yields domain-tagged output in practice.

3. **Custom agents don't get a per-category score bar.** `ScoreCategory` is a
   closed six-item union (`scorer/types.ts:4`); custom agent findings feed the
   total penalty but are invisible in the category breakdown and the HTML
   "category scores" chart. This is a deliberate scoping (widening
   `ScoreCategory` to dynamic strings would ripple through the scorer, badge,
   and every reporter), but it means a user who adds a custom "API Design" agent
   won't see an "API Design" score bar. Documented, not fixed.

4. **Capability-tier restriction on fallback chains was intentionally NOT added**
   (C1 from the original audit). The chosen lighter solution surfaces fallback
   *counts* in the summary instead of restricting which providers may back up
   which. A primary can still silently fall back to a weaker model on a 503; the
   user now sees *that* it happened but not *whether* the fallback was
   quality-equivalent. Acceptable per the prompt ("either surface it OR
   restrict"), but it's a real information gap.

5. **The `templates/report.html` sparkline injection** uses `JSON.stringify`
   into a `<script>` block (`html.ts:230-231`). Mitigated to numeric-only
   (`html.ts:211`) and the source is local history JSON, so risk is low — but
   the pattern is technically still string-interpolation into JS, not
   `textContent` assignment. Not changed; flagged for honesty.

6. **No test asserts the fail-fast error message is user-readable end-to-end**
   through `handleFatalError` → terminal. The loader throws the right typed
   error (tested), and `handleFatalError` renders `PaladeConfigError` (read in
   code), but the two are not joined in a test.

7. **Stale scratch docs removed.** `PHASE1-AUDIT.md` / `PHASE2-FIX.md` were
   untracked notes that had drifted from the code (referenced a renamed
   symbol). This consolidated doc replaces them.
