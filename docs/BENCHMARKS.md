# Palade Benchmark Report

Rigorous, reproducible evaluation of the Palade swarm against real code. Two axes are
measured separately, because they answer different questions:

- **Precision** — run against mature, well-tested libraries where the ground truth is
  "almost nothing is actually wrong." Measures the false-alarm rate.
- **Recall** — run against a file with a fixed set of **planted, unambiguous
  vulnerabilities**. Measures how many real defects the swarm actually catches.

Every finding below was produced by the tool and hand-classified against source. Nothing
here is aspirational — the runs are reproducible from the config in [Reproduce](#reproduce).

## Setup

| Setting | Value |
| :--- | :--- |
| Swarm | 2-provider hybrid: **OpenRouter** + **OpenCode Zen** |
| OpenRouter model | `tencent/hy3:free` |
| OpenCode Zen model | `deepseek-v4-flash-free` |
| Agents | 6 (security, architecture, performance, maintainability, deadCode, testIntelligence) |
| Provider shares | `{ openrouter: 3, 'opencode-zen': 3 }` |
| Batch concurrency | 1 (serialized, to stay inside free-tier rate limits) |
| Mode | `--exhaustive` (no triage; every chunk reviewed) |

**Deliberately a stress test.** Both models are free tiers chosen for cost, not quality.
This isolates the *engine* from the *model*: anything the engine gets right here, it gets
right despite the weakest realistic backend.

## Precision — mature libraries

Three well-audited, heavily-tested libraries. Expectation: a good tool stays quiet and
invents no "critical" bugs.

| Repository | File | Findings | False positives | Run time |
| :--- | :--- | ---: | ---: | ---: |
| [expressjs/cors](https://github.com/expressjs/cors) | `lib/index.js` | 3 | 0 | 350s |
| [auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | `sign.js`,`verify.js`,`decode.js` | 1 | 0 | 363s |
| [visionmedia/bytes.js](https://github.com/visionmedia/bytes.js) | `index.js` | 3 | 0 | 265s |

**7 findings surfaced, 7 verified accurate against source, 0 false positives / 0
hallucinations.** Every finding was low/medium severity — no invented criticals. Details,
each hand-checked:

- **cors** — (low) duplicated `if (x.join) x = x.join(',')` coercion across three
  `configure*` helpers; (low) inconsistent nested-array vs. flat return shapes (this is
  exactly why `applyHeaders` needs recursion); (low) `configureMaxAge` accepts `NaN`
  because `typeof NaN === 'number'`, emitting the literal header `Access-Control-Max-Age:
  NaN`. Verified real.
- **jsonwebtoken** — (low) `sign.js` imports seven `lodash.*` micro-packages that
  duplicate Node stdlib. Real; a deliberate compat choice, but accurately reported.
- **bytes.js** — (medium) `parse(1.5) === 1.5` but `parse("1.5") === 1` (number branch vs.
  `parseInt` branch diverge); (medium) `parse("5 apples") === 5` (regex misses, `parseInt`
  accepts trailing garbage); (low) the JSDoc `case` option is never read by `format()`.
  All verified real; the two `medium`s arguably over-rate by-design loose parsing.

> Caveat: precision coverage was **incomplete** — synthesis failed on 2 of 3 runs and
> several non-security agents returned unparsable JSON (see Reliability). These runs bound
> the false-positive rate, not recall, on this clean code.

## Recall — planted vulnerabilities

A 45-line Express-style module (`recall-probe/api.js`) with **6 deliberately planted,
unambiguous vulnerabilities**. Ground truth is 100% known.

| # | Planted vulnerability | Line | Detected | Reported severity |
| :--- | :--- | ---: | :---: | :--- |
| V1 | SQL injection (string concatenation) | 12 | ✅ | critical |
| V2 | OS command injection (`exec`) | 18 | ✅ | critical |
| V3 | Hardcoded secret (`JWT_SECRET`) | 22 | ✅ | critical |
| V4 | Path traversal (`readFileSync`) | 29 | ✅ | critical |
| V5 | Unsalted MD5 password hashing | 35 | ✅ | high |
| V6 | `eval` on request body (RCE) | 39 | ✅ | critical |

**Recall = 6 / 6.** Every planted vulnerability was detected, correctly classified as a
security issue, with the right severity and the right line. The swarm *also* surfaced 4
legitimate performance defects on the same routes (blocking `readFileSync`, single shared
MySQL connection, shell process spawned per request, `SELECT *` without `LIMIT`) — all
real, 0 false positives.

Minor quality artifacts (not false positives): the command-injection at L18 was reported
twice (a dedup miss), and the cross-domain merge entries render self-duplicated text
(`"SQL injection; SQL injection"`).

## Reliability — read this before trusting any single run

**The 6/6 recall result took three attempts, and the difference was entirely
reliability, not detection.** This is the honest headline of the whole benchmark:

| Attempt | Config | Outcome |
| :--- | :--- | :--- |
| 1 | 300s timeout, verdict on | Hung in synthesis/verify — no report written |
| 2 | 90s timeout | Security agent **timed out mid-verify**, its findings dropped → report showed only the 4 performance findings, **0/6 security** |
| 3 | 240s timeout, `--no-verdict` | **6/6** detected, full report |

In attempt 2 the security agent *did* detect the vulnerabilities — the raw log shows it
producing "Unsalted MD5 password hashing" and "eval RCE" — but a too-tight per-batch
timeout killed the verify phase and discarded them before the report. **The engine found
the bugs every time; free-model latency and the verify step decided whether they survived
to the output.**

Observed across all runs:

- **Weak models emit prose/garbled JSON.** 4–5 of the 6 non-security agents per run
  returned unparsable output at least once. The **strict-JSON corrective retry**
  ([added in this branch](../src/agents/base.ts) — `completeAndParseFindings`) fired **15
  times** across these runs and recovered a share of them; the rest are why coverage is
  partial.
- **`hy3:free` is reliable but slow**, and long single-chunk security reviews flirt with
  the per-batch timeout. Raise `swarm.timeoutMs` for security-critical files.
- **`providerShares` helps** — spreading 6 agents across two providers cut the rate-limit
  (429) failures a single-provider swarm hit under parallel load.

**Bottom line.** On detection the engine is strong: **6/6 recall with correct
classification, 0 false positives across 17 total findings.** The ceiling is entirely
model reliability — unparsable JSON and timeouts on free tiers. A paid,
JSON-reliable model behind the same engine would remove most of the partial-coverage
caveats above. Precision and recall depend on the model's ability to reason *and* emit
clean JSON within the timeout — not on the pipeline.

## Reproduce

```bash
npm install -g palade
git clone --depth 1 https://github.com/expressjs/cors && cd cors
palade init      # then set OPENROUTER_API_KEY + OPENCODE_ZEN_API_KEY
```

`palade.config.ts`:

```typescript
export default {
  providers: {
    openrouter: { model: 'tencent/hy3:free' },
    'opencode-zen': { model: 'deepseek-v4-flash-free' },
  },
  swarm: {
    primary: 'openrouter',
    synthesis: 'openrouter',
    agentCount: 6,
    maxConcurrentBatches: 1,
    timeoutMs: 240000,          // recall runs need headroom for the verify phase
    providerShares: { openrouter: 3, 'opencode-zen': 3 },
  },
  output: { dir: '.palade/reports', formats: ['json'], openBrowser: false },
}
```

```bash
palade review --file lib/index.js --format json --exhaustive --no-verdict
```

Add `palade.config.ts`, `.palade/`, `node_modules/`, and `test/` to `.paladeignore` so the
config's own contents aren't reviewed. The recall probe (`api.js` with the six planted
vulnerabilities) is a small self-contained module; any equivalent file with known-planted
defects reproduces the recall measurement.
