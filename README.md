# Palade

**AI-powered codebase intelligence — reviewed by a swarm, not a single bot.**

CodeRabbit reviews what changed. Palade reviews what *is*.

Palade is an open-source CLI tool that deploys a parallel swarm of specialist AI agents across your entire codebase (or any part of it) and produces a structured health report — findings, a 0–100 health score, and prioritized fixes. It runs entirely on your machine, with your own API keys. No telemetry, no proxy, no lock-in.

---

## Why Palade?

Most AI review tools live in the diff. They catch what a PR changed but are architecturally blind to what's already broken:

- Auth logic duplicated across six files with subtle differences
- Three incompatible error-handling philosophies introduced by three different developers
- A `RecommendationEngine` that's fully built, fully wired into nothing, quietly rotting
- An `/api/v2/export` route with a handler, middleware, and a DB query — never called from the frontend

No PR review catches this. Palade is built specifically to find it.

---

## Quick Start

```bash
npx palade init      # scaffold config + targets + ignore files
npx palade review    # run the swarm on your codebase
```

A report opens automatically in your browser, plus a `palade-badge.svg` you can drop in your README:

```md
![Palade Score](./palade-badge.svg)
```

---

## How It Works

1. **Ingest** — walks your project, respects `.paladeignore`, and chunks files at semantic boundaries (functions, classes — not arbitrary line counts)
2. **Swarm** — six specialist agents run in parallel, each reviewing the codebase through one lens
3. **Synthesize** — a synthesis agent merges all findings, removes duplicates, and writes an executive summary with prioritized fixes
4. **Score** — a 0–100 Palade Health Index across six dimensions, tracked over time
5. **Report** — a self-contained HTML report (works offline, no CDN), plus JSON and Markdown output

```
Palade Score: 68/100  ↓2 from last week

Architecture        74   ████████░░
Security            58   █████░░░░░
Maintainability     61   ██████░░░░
Test Intelligence   71   ███████░░░
Dead Weight         64   ██████░░░░
Consistency         69   ██████░░░░
```

---

## The Swarm

| Agent | Looks For |
|---|---|
| **Security** | Injection risks, auth gaps, hardcoded secrets, missing input validation |
| **Architecture** | Circular dependencies, layer violations, tight coupling, God objects |
| **Performance** | N+1 patterns, unbounded loops, missing caching, sync-in-async |
| **Maintainability** | Duplicated logic, inconsistent naming, undocumented complexity |
| **Dead Code** | Unused exports, zombie routes, unwired classes, stale TODOs |
| **Test Intelligence** | Untested critical paths, hollow mocks, missing edge cases |

A synthesis agent then cross-references all six sets of findings — catching issues that only show up when domains overlap (e.g. an auth bug that's also a performance bug that's also untested).

---

## Custom Targets

Define named subsystems in `palade.targets.ts` and the swarm reviews them with full context:

```ts
// palade.targets.ts
export default [
  {
    name: "research-pipeline",
    description: "AI research orchestration — chunking, retrieval, synthesis chain",
    entry: ["src/research/", "src/agents/"],
    focus: ["data flow", "hallucination risks", "context window leaks"],
  },
  {
    name: "auth-system",
    entry: ["src/auth/", "src/middleware/auth.ts"],
    focus: ["security", "token handling", "session logic"],
  }
]
```

```bash
npx palade review --target research-pipeline
npx palade review --all-targets
```

The agents receive your description and focus areas as part of their system prompt. A review of your RAG pipeline knows to look for context window leaks. A review of your auth system knows to look for token handling bugs. It's institutional knowledge, encoded once, reused forever.

---

## Scoped Reviews

Review as much or as little as you want — same tool, same output quality:

```bash
npx palade review                          # whole codebase
npx palade review src/auth/                # a folder
npx palade review src/billing/webhook.ts   # a file
npx palade review "src/**/*.service.ts"    # a glob
npx palade review src/utils.ts::parseJWT   # a single function
npx palade review --pick                   # interactive picker
```

Flag things inline as you write code:

```ts
// @palade review: this retry logic feels wrong, check edge cases
async function retryWithBackoff(fn, attempts = 3) { ... }

// @palade ignore
function legacyMigrationHelper() { ... }
```

---

## Review Modes

| Mode | Command | Output |
|---|---|---|
| Standard | `palade review` | Full balanced audit |
| Security | `--mode security` | Attack surface map, entry points, auth gaps |
| Onboard | `--mode onboard` | `ARCHITECTURE.md`, `DATA_FLOWS.md`, `DANGER_ZONES.md`, `GOTCHAS.md` |
| Debt | `--mode debt` | Technical debt in developer-hours, by severity tier |
| Ghost | `--mode ghost` | Dead code, zombie features, unwired implementations |

```bash
npx palade review --mode onboard
```

generates the docs a new contributor needs on day one — automatically, from the actual code.

---

## CI Integration

```bash
npx palade diff --base main
```

Reviews only what your branch changed, shows the score delta, and exits non-zero on critical findings — drop it straight into GitHub Actions.

---

## Setup — Bring Your Own Keys

Palade is BYOK. Set whichever provider keys you have:

```bash
export GROQ_API_KEY="..."
export CEREBRAS_API_KEY="..."
export OPENROUTER_API_KEY="..."
export NVIDIA_API_KEY="..."
```

Or add them to `palade.config.ts` (auto-generated by `palade init`, auto-added to `.gitignore`).

```ts
// palade.config.ts
export default {
  providers: {
    groq: { apiKey: process.env.GROQ_API_KEY },
    cerebras: { apiKey: process.env.CEREBRAS_API_KEY },
  },
  swarm: {
    primary: "groq",       // parallel swarm agents
    synthesis: "cerebras", // final synthesis pass
  }
}
```

Palade checks provider availability at startup and falls back automatically if a provider is rate-limited or unreachable. Multiple keys per provider are supported and round-robined.

> **No keys ever leave your machine.** Every call goes directly from your computer to the provider's API. Palade has no server, no proxy, and no telemetry.

---

## CLI Reference

```
palade init                       Scaffold config, targets, and ignore files
palade review [path]              Run the swarm
  --target <name>                  Review a named target
  --all-targets                    Review every target
  --dir / --file / --glob           Scope to a path
  --mode <mode>                     standard | security | onboard | debt | ghost
  --annotations                     Only review @palade-flagged code
  --pick                            Interactive scope picker
  --depth <n>                       Symbol dependency trace depth

palade diff --base <branch>       Branch pre-flight review (CI-friendly)
palade watch                      Background architectural drift detection
palade score                      Show current score and history
palade targets search <query>     Search community target packs
palade targets add <pack>         Install a community target pack
```

---

## .paladeignore

Same syntax as `.gitignore`. Generated automatically with sensible defaults:

```
node_modules/
dist/
build/
*.lock
*.min.js
coverage/
.palade/
```

---

## Community Target Packs

Publish and install shareable target definitions for common stacks:

```bash
npx palade targets search rag
npx palade targets add rag-pipeline-audit
```

Target packs are published as `@palade-targets/<name>` npm packages. If you've built a great review spec for your stack — Stripe integrations, Next.js apps, RAG pipelines — publish it.

---

## Roadmap

- [x] Full codebase swarm review
- [x] Palade Score + badge
- [x] Custom targets
- [x] Scoped reviews (folder/file/glob/symbol)
- [x] Review modes (security, onboard, debt, ghost)
- [x] `palade diff` for CI
- [ ] `palade watch` drift detection
- [ ] Cross-target agent memory
- [ ] Community target registry
- [ ] GitHub Action

---

## Principles

- **Open source, MIT licensed.** Trust requires transparency, especially for a tool that reads your entire codebase.
- **BYOK, always.** No hosted keys, no usage billing through Palade.
- **Zero lock-in.** All output is portable: HTML, JSON, Markdown.
- **Speed is a feature.** A review that takes 20 minutes never gets run twice. A review that takes 2 minutes becomes a habit.

---

## Contributing

Issues and PRs welcome. If you've encoded a great review spec for your stack, consider publishing it as a community target pack.

## License

<<<<<<< HEAD
MIT
=======
MIT
>>>>>>> 52d3eaa49d73913599074b10489a34ffafa3755e
