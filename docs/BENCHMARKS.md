# Palade Benchmark Report

Reproducible run of the Palade swarm against real public repositories. Every finding
below was produced by the tool and the highlighted ones were verified by hand against
source. No numbers here are aspirational — they come from the run described in the
[Reproduce](#reproduce) section.

## Setup

| Setting | Value |
| :--- | :--- |
| Swarm | 2-provider hybrid: **OpenRouter** + **OpenCode Zen** |
| OpenRouter model | `tencent/hy3:free` |
| OpenCode Zen model | `deepseek-v4-flash-free` |
| Agents | 6 (security, architecture, performance, maintainability, deadCode, testIntelligence) |
| Provider shares | `{ openrouter: 3, 'opencode-zen': 3 }` |
| Batch concurrency | 1 (serialized, to stay inside free-tier rate limits) |

## Targets & Results

| Repository | File(s) | Agents parsed | Findings | Run time |
| :--- | :--- | :--- | ---: | ---: |
| [expressjs/cors](https://github.com/expressjs/cors) | `lib/index.js` | 6 / 6 | 6 | 338s |
| [auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | `sign.js`, `verify.js`, `decode.js` | 4 / 6 | 7 | 320s |

### expressjs/cors — findings

| Severity | Location | Finding |
| :--- | :--- | :--- |
| Medium | `lib/index.js:144` | `applyHeaders` uses recursion over the header array — stack-overflow risk on deeply nested input |
| Low | `lib/index.js:19` | `isOriginAllowed` recurses over allowed-origin arrays (same pattern) |
| Low | `lib/index.js:208` | Unnecessary object creation in hot path |
| Info | — | Duplicated CSV-join and unvalidated `maxAge` trace to one missing header-serialization/validation helper |

✅ **Hand-verified defect** (surfaced on a prior single-provider run of the same file): in
`configureOrigin` (`lib/index.js:57–62`), when a consumer sets `origin: true` and a request
arrives with **no `Origin` header** (server-to-server, curl, health checks), `requestOrigin`
is `undefined`, `isOriginAllowed(undefined, true)` returns `true` (`!!true`), and cors emits
the invalid header `Access-Control-Allow-Origin: undefined`. Reachable on the library's
public API.

### auth0/node-jsonwebtoken — findings

| Severity | Location | Finding |
| :--- | :--- | :--- |
| Medium | `sign.js:11` / `verify.js` | Algorithm enums (`PUB_KEY_ALGS`, `EC_KEY_ALGS`, …) defined independently in both files — drift risk |
| Medium | `sign.js:114` | Key material re-parsed (`createPrivateKey`) on every sign call unless already a `KeyObject` |
| Medium | `verify.js:120` | Key material re-parsed on every verify call — same pattern |
| Low | `verify.js:239` | Redundant key-size check |
| Low | `sign.js:126` | Key-type vs. algorithm check duplicated across files |
| Low | `index.js:5` | Lodash micro-packages duplicating stdlib |

✅ **Hand-verified**: `sign.js:114` — `createPrivateKey(secretOrPrivateKey)` executes on
every call when a caller passes a PEM string instead of a cached `KeyObject`; the parse is
not memoized. A real, if minor, per-call cost.

## Reliability Notes (read before trusting the numbers)

The swarm's output quality is bounded by the model behind each agent:

- **Model choice matters more than anything else.** On a wider free-tier mix
  (`groq/llama-3.3-70b`, `nvidia/minimax-m3`, `cerebras/llama3.1-8b`), 2–4 of 6 agents per
  run returned unparseable output — weak models emit prose instead of strict JSON, and
  groq/nvidia hit `429` rate limits under parallel load. Restricting the swarm to
  `hy3:free` + `deepseek-v4-flash-free` took cors to **6/6 agents parsing**.
- **`hy3:free` is reliable but slow.** On the larger 5-chunk jsonwebtoken input the
  **security agent timed out** (240s), so that run has no security findings. Raise
  `swarm.timeoutMs` or narrow the input for security-critical files.
- **`providerShares` measurably helps.** Spreading agents across two providers instead of
  hammering one cut rate-limit failures versus a single-provider swarm.

**Bottom line:** the pipeline works and surfaces real, verifiable defects. Precision and
recall depend entirely on giving each agent a model that can both reason and emit clean
JSON within the timeout — not on the engine.

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
    timeoutMs: 240000,
    providerShares: { openrouter: 3, 'opencode-zen': 3 },
  },
}
```

```bash
palade review --file lib/index.js --format json
```

Add `palade.config.ts`, `.palade/`, `node_modules/`, and `test/` to `.paladeignore` so the
config file's own contents aren't reviewed.
