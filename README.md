<div align="center">

# 🤖 Palade

**The AI-Powered Codebase Intelligence Engine**

[![npm version](https://img.shields.io/npm/v/palade.svg?style=for-the-badge&color=blue)](https://npmjs.org/package/palade)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)]()
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?style=for-the-badge&logo=node.js&logoColor=white)]()

*Palade isn't a single bot. It's an orchestrated **swarm of specialized AI agents** that triage, debate, arbitrate, and synthesize to find security flaws, architectural rot, and dead code in your codebase — then hand you a prioritized, actionable report.*

![Palade TUI](assets/tui.png)

</div>

---

## 📚 Table of Contents

- [Why Palade?](#-why-palade)
- [Benchmarks](#-benchmarks)
- [Quick Start](#-quick-start)
- [How It Works — The Five-Phase Pipeline](#-how-it-works--the-five-phase-pipeline)
- [The Agent Swarm](#-the-agent-swarm)
- [Review Modes](#-review-modes)
- [Provider Support](#-provider-support-100-free-tier-available)
- [Hybrid Routing & Provider Shares](#-hybrid-routing--provider-shares)
- [CLI Commands](#%EF%B8%8F-cli-commands)
- [The Interactive TUI](#-the-interactive-tui)
- [Configuration](#%EF%B8%8F-configuration)
- [Steering Reviews with Annotations](#-steering-reviews-with-annotations)
- [Verdict Mode & Architecture Decision Records](#%EF%B8%8F-verdict-mode--architecture-decision-records)
- [Codebase Health Score](#-codebase-health-score)
- [Cost Control](#-cost-control)
- [CI/CD Integration](#-cicd-integration)
- [Performance Tuning Knobs](#-performance-tuning-knobs)

---

## 🎯 Why Palade?

Traditional AI coding assistants send your entire file to a single language model and hope for the best. Palade mimics how a real engineering team reviews code:

1. **🔍 Triage** — scans your repository and ranks files by risk (churn, centrality, naming heuristics) so the token budget goes where the bugs live.
2. **🧠 Specialist agents** — up to 8 distinct agents run *concurrently* over the same code, each with its own domain expertise: *Security, Architecture, Performance, Maintainability, Dead Code, Test Intelligence, Pragmatism, and Logic.*
3. **⚖️ Arbitration** — when two agents disagree about the same lines, an arbitration engine resolves the conflict and records the decision as an ADR.
4. **📋 Synthesis** — merges, deduplicates, and compiles everything into a prioritized executive summary with ROI estimates — as interactive HTML, JSON, and Markdown.

**Palade does code review — nothing else.** It never refactors, executes, or generates code. Findings are read-only until a human acts on them.

---

## 🏆 Benchmarks

Reproducible run of a 2-provider hybrid swarm (**OpenRouter** `tencent/hy3:free` + **OpenCode Zen** `deepseek-v4-flash-free`) against real public repositories. Every finding was produced by the tool; the highlighted ones were verified by hand against source.

| Repository | Agents parsed | Findings | Verified defect |
| :--- | :--- | ---: | :--- |
| [expressjs/cors](https://github.com/expressjs/cors) | 6 / 6 | 6 | `origin: true` + missing `Origin` header → invalid `Access-Control-Allow-Origin: undefined` |
| [auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) | 4 / 6 | 7 | Key material re-parsed on every `sign`/`verify` call when passed a PEM string |

Output quality is bounded by the model behind each agent — restricting the swarm to JSON-reliable models took cors to **6/6 agents parsing**, and `providerShares` measurably cut rate-limit failures by spreading load across providers.

📊 Full methodology, exact config, per-finding table, and reliability notes: **[docs/BENCHMARKS.md](docs/BENCHMARKS.md)**

---

## ⚡ Quick Start

```bash
# Install globally
npm install -g palade

# Initialize in your project (creates palade.config.ts)
palade init

# Launch the interactive TUI
palade

# ...or run a review straight from the CLI
palade review
```

Requires **Node.js ≥ 20**. Works with 100% free-tier providers out of the box (see below).

---

## 🔬 How It Works — The Five-Phase Pipeline

```
 ┌───────────┐   ┌────────┐   ┌───────────┐   ┌─────────────┐   ┌───────────┐
 │ 1. INGEST │ → │ 2.TRIAGE│ → │ 3. SWARM  │ → │ 4. VERDICT  │ → │ 5. REPORT │
 │  & chunk  │   │  rank   │   │ N agents  │   │  arbitrate  │   │ synthesize│
 └───────────┘   └────────┘   └───────────┘   └─────────────┘   └───────────┘
```

| Phase | What happens |
| :--- | :--- |
| **1. Ingestion & Chunking** | Walks your tree (respecting `.paladeignore`), parses TypeScript/JavaScript into an **AST** and chunks at symbol boundaries — functions and classes stay intact instead of being split mid-scope. Other languages fall back to overlapping line-based chunks. A **keyword index** of exports/symbols is built, and each chunk gets **retrieved context injected**: the definitions of cross-file symbols it uses. |
| **2. Triage** | If the codebase exceeds the review token budget (default 200k), a cheap LLM call ranks files by churn, import centrality, risky names (`auth`, `api`, `handler`, `payment`…), and size. Only the highest-value chunks proceed. Skip it entirely with `--exhaustive`. |
| **3. Swarm** | Specialist agents run **in parallel**, each processing token-bounded batches with per-agent timeouts. A timeout on one batch never discards findings from the others; only a fatal auth error aborts the run. |
| **4. Verdict** | Findings from different agents on overlapping line ranges are detected as conflicts and sent to an LLM arbiter. Decisions are saved as **ADRs** in `.palade/decisions/`. |
| **5. Synthesis** | All merged, deduplicated findings become an executive summary: priority fixes with impact/effort ratings, cross-cutting observations, and a technical-debt estimate with the highest-ROI fix highlighted. |

Because chunking preserves AST boundaries, findings point at exact `startLine → endLine` ranges — not vague file-level hand-waving.

---

## 🐝 The Agent Swarm

| Agent | Hunts for |
| :--- | :--- |
| 🔐 **Security** | Injection, broken auth, hardcoded secrets, missing input validation, weak cryptography |
| 🏛️ **Architecture** | Circular dependencies, layer violations, tight coupling, God objects |
| 🚀 **Performance** | N+1 queries, unbounded loops, missing caching, sync-in-async |
| 🧹 **Maintainability** | Duplication, naming problems, undocumented complexity |
| 💀 **Dead Code** | Unused exports, zombie routes, unwired classes, stale TODOs |
| 🧪 **Test Intelligence** | Untested critical paths, hollow mocks, missing edge cases |
| ⚖️ **Pragmatism** | Cost/benefit tradeoffs — what's worth fixing *now* vs. deferring |
| 🧮 **Logic** | Business-logic correctness, state-machine violations |

Agents are listed in **priority order** — if you lower `agentCount`, Palade keeps the most critical specialists and drops from the bottom.

**Custom agents** are first-class: define your own domain lens (naming conventions, i18n rules, your team's constitution) in config and it runs alongside the built-ins.

---

## 🎭 Review Modes

```bash
palade review --mode security
```

| Mode | Focus |
| :--- | :--- |
| `standard` | Balanced full-swarm review (default) |
| `security` | Security-first: every finding must include a concrete exploitation path |
| `onboard` | Codebase familiarization — explains structure and hotspots for new team members |
| `debt` | Technical-debt audit with ROI-ranked cleanup priorities |
| `ghost` | Dead-code sweep — finds the code nobody dares to delete |

---

## 🔌 Provider Support (100% Free Tier Available)

Palade runs entirely on your machine and talks directly to the LLM provider of your choice. No middleman, no code leaves your machine except to the provider you configure.

| Provider | Environment Variable | Notes |
| :--- | :--- | :--- |
| **OpenCode Zen** | `OPENCODE_ZEN_API_KEY` | Default. Free-tier models, great for fast checks |
| **OpenRouter** | `OPENROUTER_API_KEY` | Huge model catalog incl. free frontier-class models |
| **Groq** | `GROQ_API_KEY` | LPU-powered — reviews massive monorepos in seconds |
| **Cerebras** | `CEREBRAS_API_KEY` | Wafer-scale inference, extremely fast |
| **NVIDIA** | `NVIDIA_API_KEY` | Access to large models like Nemotron |
| **Ollama** | `OLLAMA_MODEL` / `OLLAMA_BASE_URL` | **100% private, offline, local inference** |

**Resilience built in:**
- 🔗 **Fallback chains** — if a provider errors or hits a rate limit, the request automatically retries on the next configured provider with exponential backoff + jitter.
- 🔑 **Key pools** — supply multiple API keys per provider (`GROQ_API_KEY_1`, `GROQ_API_KEY_2`, …) and Palade rotates across them; one dead key never takes down its healthy siblings.
- ☠️ **Dead-provider detection** — a provider that hits a hard daily quota or auth failure is marked dead for the session instead of being retried forever.

---

## 🎛️ Hybrid Routing & Provider Shares

Assign different providers to different roles — and split the swarm itself across providers.

```typescript
// palade.config.ts
export default {
  swarm: {
    primary: 'opencode-zen',      // default provider for agents
    synthesis: 'nvidia',          // big-picture summary gets a big model
    triage: 'groq',               // cheap + fast ranking

    // Declarative split: 5 agents on OpenCode Zen, 3 on OpenRouter.
    // Assigned over agents in priority order; anything unallocated
    // falls back to `primary`.
    providerShares: {
      'opencode-zen': 5,
      openrouter: 3,
    },

    // ...or pin individual agents (overrides providerShares per agent)
    agentProviders: {
      security: 'openrouter',
    },
  },
  providers: {
    openrouter: { model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
    'opencode-zen': { model: 'deepseek-v4-flash-free' },
  },
}
```

All of this is also editable interactively — run `/settings` in the TUI to set API keys, pick models from live model lists, choose swarm/synthesis providers, set the agent count, and dial in per-provider agent shares with arrow keys.

---

## 🖥️ CLI Commands

### `palade review`

Run a full swarm review.

```bash
palade review                          # whole project
palade review --file src/auth.ts       # specific file(s)
palade review --dir src/api            # a directory
palade review --glob "src/**/*.ts"     # a glob
palade review --pick                   # interactive file picker
palade review --target backend         # a named target from palade.targets.ts
palade review --all-targets            # every defined target
palade review --mode security          # focused mode
palade review --annotations            # only @palade-annotated code
palade review --exhaustive             # skip triage, review everything
palade review --dry-run                # estimate tokens & cost, run nothing
palade review --no-verdict             # skip conflict arbitration
palade review --format html,json,md    # choose report formats
palade review --ci --quiet             # CI-friendly output
```

### `palade diff`

Review **only what changed** — perfect for pull requests.

```bash
palade diff --base main        # findings on changed chunks only
palade diff --ci               # exit 1 if critical findings introduced
```

### `palade watch`

A review daemon: watches files, debounces changes, re-reviews automatically.

```bash
palade watch
palade watch --continuous              # background-sweep the codebase when idle
palade watch --sensitivity high        # drift sensitivity: low|medium|high
```

### `palade score`

Codebase health score with history tracking and an SVG badge.

```bash
palade score               # current score + trend
palade score --history     # full score history
```

### `palade decisions`

Browse and manage the ADRs produced by Verdict Mode.

```bash
palade decisions list
```

### `palade targets`

Manage named review targets (`palade.targets.ts`) — reusable scoped areas like `backend`, `payment-flow`, `public-api`.

### `palade settings`

Inspect and edit configuration without opening an editor.

```bash
palade settings --list                          # show current config
palade settings --set swarm.agentCount=6        # set any dotted config path
palade settings --init                          # scaffold config + ignore file
```

### `palade init` / `palade tui`

`init` scaffolds `palade.config.ts`; `tui` (or just `palade`) launches the interactive terminal UI.

---

## ✨ The Interactive TUI

Running bare `palade` opens a full terminal UI with:

- **Slash commands** — `/review`, `/diff`, `/score`, `/watch`, `/targets`, `/decisions`, `/settings`, `/init`, `/clear`, `/help` with autocomplete and command history
- **Live provider status** — see at a glance which providers have keys configured
- **Settings panel** (`/settings`) — tab between providers, paste API keys (saved to `.env`, never committed), pick models from live-fetched model lists, set swarm/synthesis providers, agent count, and per-provider agent shares
- **Graceful interruption** — Ctrl+C aborts a running swarm cleanly, keeping partial findings

---

## ⚙️ Configuration

### `palade.config.ts`

```typescript
export default {
  providers: {
    groq: { apiKey: '...', maxConcurrency: 10 },
    openrouter: { model: 'some/model:free', timeoutMs: 60_000 },
    'opencode-zen': { apiKey: '...' },
    ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder' },
  },
  swarm: {
    primary: 'opencode-zen',       // default agent provider
    synthesis: 'nvidia',           // synthesis/arbitration provider
    triage: 'groq',                // optional dedicated triage provider
    agentCount: 8,                 // how many specialists run (1–8)
    providerShares: { 'opencode-zen': 5, openrouter: 3 },
    economyMode: false,            // see Cost Control below
    maxReviewTokens: 200_000,      // triage budget
    timeoutMs: 600_000,
  },
  output: {
    dir: '.palade/reports',
    formats: ['html', 'json'],     // + 'md'
    openBrowser: true,
  },
  score: {
    historyFile: '.palade/history.json',
    badge: true,                   // generates palade-badge.svg
  },
}
```

API keys can also come from environment variables or `.env` — the TUI settings panel writes keys to `.env` only, so secrets never land in version control.

### `.paladeignore`

Like `.gitignore`, but for review scope:

```
node_modules/
dist/
*.test.ts
*.lock
```

### `palade.spec.md` *(optional)*

Describe your business logic, architectural constraints, and review goals in plain language. It's injected into every agent's context — the Logic agent especially gets much sharper with it.

### `.palade/constitution.md` *(optional)*

Behavioral guidelines for the agents: *"never flag X as a bug when Y is true."* Your team's review culture, encoded.

---

## 📝 Steering Reviews with Annotations

Drop comments in your code to steer the swarm:

```typescript
// @palade review — flag this for review
function criticalAuthLogic() { ... }

// @palade focus: security — prioritize for the security agent
function handlePayment() { ... }

// @palade ignore — skip this; it's legacy and we know
const oldUtility = (...) => { ... }
```

File-level and line-level ignores are both supported. Run `palade review --annotations` to review *only* annotated code.

---

## ⚖️ Verdict Mode & Architecture Decision Records

When the Security agent says *"this synchronous check is a vulnerability"* and the Performance agent says *"this synchronous check is a bottleneck — make it async"*, someone has to decide.

Palade detects findings from different agents on **overlapping line ranges**, sends both sides to an LLM arbiter, and gets back a decision with tradeoff rationale and confidence. Each decision is:

- injected back into the report as an `architectural-decision` finding, and
- persisted as a Markdown **ADR** in `.palade/decisions/` (with a retention cap so the directory can't grow unbounded)

Disable with `--no-verdict` if you want raw, unarbitrated findings.

---

## 📊 Codebase Health Score

Every review updates a health score computed from finding severity, cross-agent agreement (two agents flagging the same code is a strong signal), and complexity penalties — all weights configurable in `score` config.

- 📈 **History** — trends tracked in `.palade/history.json`
- 🏅 **Badge** — auto-generated `palade-badge.svg` for your README
- 🎚️ **Tunable** — severity weights, penalty caps, and complexity thresholds are all yours to override

---

## 💰 Cost Control

- **`palade review --dry-run`** — a full token/cost estimate broken down by provider, model, and agent count. Know the bill before you pay it.
- **Triage budget** (`maxReviewTokens`) — hard cap on review size; the ranking ensures the riskiest code gets reviewed first.
- **Economy Mode** (`economyMode: true`, off by default) — sends each batch to **one** combined multi-domain call instead of N parallel per-agent calls, cutting the ~6× resend of the same chunk content. Tradeoff: higher latency and less domain-specialized prompting. Flip it on when budget matters more than speed.
- **Free-tier friendly** — the default provider stack runs on $0/month.

---

## 🔁 CI/CD Integration

```yaml
# .github/workflows/palade.yml
- name: Palade review (changed files only)
  run: |
    npm install -g palade
    palade diff --base main --ci --quiet
  env:
    OPENCODE_ZEN_API_KEY: ${{ secrets.OPENCODE_ZEN_API_KEY }}
```

`--ci` exits non-zero when critical findings are introduced, failing the check. JSON output makes it easy to post findings as PR comments.

---

## 🎚 Performance Tuning Knobs

| Knob | Effect |
| :--- | :--- |
| `swarm.maxReviewTokens` | Lower = more aggressive triage, fewer chunks reviewed |
| `swarm.agentCount` | Fewer agents = less parallelism, lower cost |
| `swarm.economyMode` | One combined call per batch instead of N |
| `swarm.timeoutMs` | Faster failure vs. risk of truncation |
| `swarm.maxConcurrentBatches` | Rate-limit compliance vs. throughput |
| `--exhaustive` | Skip triage entirely, review every chunk |

---

## 🤝 Contributing

Issues and PRs welcome. The codebase itself ships with a pre-built [graphify](https://github.com/Graphify-Labs/graphify) knowledge graph (`graphify-out/`) and a detailed architecture guide in `CLAUDE.md` — new contributors can get productive fast.

```bash
git clone https://github.com/TheHonoredOne914/Palade
cd Palade
npm install
npm test          # vitest
npm run build
```

## 📄 License

MIT

---

<div align="center">
  <b>Built for modern codebases. Designed to catch what humans miss.</b>
  <br/><br/>
  <i>Reviewed by a swarm. Fixed by you.</i>
</div>
