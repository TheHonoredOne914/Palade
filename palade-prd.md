# Palade — Product Requirements Document (PRD)
**Version:** 0.1  
**Status:** Draft  
**Owner:** Palade Core Team

---

## 1. Product Vision

> **Palade is an open-source, AI-powered codebase intelligence engine that deploys sub-agent swarms to review, audit, and track the health of entire codebases — not just pull requests.**

Where tools like CodeRabbit review *what changed*, Palade reviews *what is*. It gives developers, teams, and contributors a deep, persistent, structured understanding of their codebase — from architecture drift to ghost features, from attack surfaces to onboarding maps.

---

## 2. Problem Statement

### 2.1 The PR Review Gap
Modern AI code review tools are scoped to diffs. They catch what changed in a PR but are architecturally blind to systemic problems: duplicated logic across 12 files, three incompatible error-handling philosophies, a security surface nobody mapped, or an entire subsystem that was built and never wired in.

### 2.2 The Codebase Comprehension Problem
New contributors spend days understanding large codebases. There is no tool that reads a codebase and produces a structured, accurate, human-readable architectural map — automatically.

### 2.3 The Technical Debt Black Hole
Teams know debt exists. They cannot quantify it, prioritise it, or track whether it's growing or shrinking. It remains invisible until it becomes critical.

### 2.4 The Targeted Audit Gap
When a developer wants a deep review of a specific subsystem — their research pipeline, their auth system, their billing module — there is no tool that accepts that scoped intent and directs AI review accordingly. They paste code into ChatGPT manually or write their own prompts from scratch every time.

---

## 3. Target Users

### Primary
- **Solo developers and indie hackers** — want a full audit of their project before launch or open-sourcing
- **OSS contributors** — need to understand an unfamiliar codebase fast
- **Tech leads** — want periodic architectural health checks without manual review

### Secondary
- **Startup CTOs** — want technical debt quantified for sprint planning and stakeholder conversations
- **Security-focused teams** — want attack surface mapping and entry-point auditing
- **Dev teams onboarding new hires** — want auto-generated architectural documentation

### Distribution Persona
Palade's primary growth vector is the developer who drops `npx palade review` into their README and tweets a screenshot of the Health Score badge. The product spreads via visible output.

---

## 4. Core Features

### 4.1 Full Codebase Swarm Review
Deploy a parallel swarm of specialist agents across an entire codebase. Each agent owns a domain (security, architecture, performance, maintainability, dead code, test intelligence). Findings are synthesised into a structured report.

**Acceptance Criteria:**
- Swarm spawns minimum 6 parallel agents
- Total review time for a 50k-line codebase under 3 minutes on Groq
- Output includes: per-domain findings, severity ratings, file + line references, and a synthesised executive summary
- Report saved as both `.html` (local browser) and `.json` (machine-readable)

---

### 4.2 Palade Score — Codebase Health Index
A single composite 0–100 score across six dimensions, tracked over time, embeddable as a README badge.

**Dimensions:**
- Architecture (25pts)
- Security (20pts)
- Maintainability (20pts)
- Test Intelligence (15pts)
- Dead Weight (10pts)
- Consistency (10pts)

**Acceptance Criteria:**
- Score computed on every full review
- Score delta shown vs. previous run (`↑3` / `↓4`)
- Badge generated as SVG, embeddable via markdown
- Score history stored locally in `.palade/history.json`

---

### 4.3 Custom Targets
Users define named subsystems in `palade.targets.ts`. Each target specifies entry paths, focus areas, and a description. Agents receive this context and review accordingly — not generically.

**Acceptance Criteria:**
- Target schema validated on startup
- `--target <name>` flag narrows swarm scope to target paths
- Target description and focus injected into agent system prompts
- `--all-targets` runs every target sequentially, cross-references findings

---

### 4.4 Scoped Review
Review any subset of the codebase: folder, file, glob pattern, or symbol-level (function/class).

**Acceptance Criteria:**
- Folder, file, and glob scope supported via CLI args
- Symbol-level scope via `file.ts::FunctionName` syntax
- Symbol scope triggers dependency tracing — agents see the symbol and all files it imports from or calls
- `--pick` flag launches interactive checkbox selector

---

### 4.5 Review Modes

| Mode | Command | Purpose |
|------|---------|---------|
| Standard | `palade review` | Full balanced audit |
| Security | `--mode security` | Entry points, auth gaps, injection risks |
| Onboard | `--mode onboard` | Generate ARCHITECTURE.md, DATA_FLOWS.md, DANGER_ZONES.md, GOTCHAS.md |
| Debt | `--mode debt` | Technical debt quantification in developer hours |
| Ghost Hunt | `--mode ghost` | Detect dead code, zombie features, unwired implementations |

**Acceptance Criteria:**
- Each mode adjusts agent system prompts and output structure accordingly
- Onboard mode produces four named markdown files
- Debt mode produces estimated hours at severity tiers (Critical / High / Medium / Low)
- Ghost mode shows estimated time-to-build wasted on dead code

---

### 4.6 `palade diff` — Branch Pre-flight
Before pushing a branch, run a comparative review against a base branch.

**Acceptance Criteria:**
- `--base <branch>` compares current working tree against specified branch
- Shows: new issues introduced, score delta, pattern inconsistencies, duplicate logic
- Exits with non-zero code if critical issues found (CI/CD compatible)

---

### 4.7 `palade watch` — Drift Detection
Background watcher that detects architectural drift in real time as files are saved.

**Acceptance Criteria:**
- Watches for significant file changes (debounced, ignores test/build files)
- On change, runs lightweight single-agent consistency check
- Reports drift as terminal notification with file + line reference
- Configurable sensitivity (`--sensitivity low/medium/high`)

---

### 4.8 Inline Annotations
Developers flag specific functions, classes, or files for review or ignore via comments.

**Accepted annotations:**
- `// @palade review: <reason>` — flag for focused review
- `// @palade focus: security|performance|architecture` — assign domain
- `// @palade ignore` — exclude from all reviews

**Acceptance Criteria:**
- `--annotations` flag activates annotation-driven scoping
- Annotations parsed from all supported languages (TS, JS, Python, Go, Rust)
- Ignored files/functions excluded from swarm scope entirely

---

### 4.9 Community Target Registry
Public registry of shareable target packs. Users publish and install targets for common stacks.

**Acceptance Criteria:**
- `npx palade targets search <query>` searches registry
- `npx palade add-targets <pack-name>` installs to local `palade.targets.ts`
- Registry hosted on npm under `@palade-targets/` namespace
- Star count and author shown in search results

---

### 4.10 Agent Memory — Cross-Target Intelligence
During full runs, agents share findings across targets to detect cross-cutting issues.

**Acceptance Criteria:**
- Shared findings surface explicitly in final report under "Cross-Target Issues"
- Example cross-target findings: mismatched error schemas between modules, inconsistent auth patterns, shared utilities with diverging implementations
- Cross-target findings ranked by blast radius (how many targets affected)

---

## 5. User Stories

- *As a solo dev*, I want to run `npx palade review` on my project and get a structured health report in under 3 minutes, so I know what to fix before launch.
- *As a tech lead*, I want to define named targets for each subsystem and run weekly audits, so I can track architectural health over time.
- *As a new contributor*, I want to run `palade review --mode onboard` and get an auto-generated architecture doc, so I can understand the codebase without reading 50 files.
- *As a security engineer*, I want to run `palade review --mode security` and get a mapped attack surface with file and line references, so I can prioritise security hardening.
- *As a developer*, I want to run `palade diff --base main` before pushing, so I catch issues before they become PR comments.
- *As a community member*, I want to publish my RAG pipeline audit targets, so others building similar systems can benefit from my review definitions.

---

## 6. Out of Scope (v1.0)

- Cloud-hosted SaaS version (v2 roadmap)
- GitHub App integration (v1.5 roadmap)
- IDE plugins (v2 roadmap)
- Real-time collaborative review sessions
- Support for compiled binaries or non-text codebases

---

## 7. Success Metrics

| Metric | Target (3 months post-launch) |
|--------|-------------------------------|
| GitHub Stars | 2,000+ |
| Weekly npm downloads | 5,000+ |
| Community target packs published | 50+ |
| Avg review time (50k LOC) | < 3 minutes |
| Retention (ran >1 review) | > 40% of installs |
| README badge embeds detected | 500+ |

---

## 8. Roadmap

### v0.1 — Foundation
- CLI scaffold (`npx palade`)
- Groq + Cerebras + NVIDIA provider adapters
- Full codebase swarm review
- Markdown + HTML report output
- `.paladeignore` support

### v0.2 — Targeting
- `palade.targets.ts` custom target system
- Scoped review (folder, file, glob, symbol)
- `--pick` interactive selector
- Inline annotation parsing

### v0.3 — Intelligence
- Palade Score + badge generation
- `palade diff` branch pre-flight
- Ghost Hunter mode
- Debt estimation mode
- Onboard mode

### v0.4 — Memory & Drift
- Cross-target agent memory
- `palade watch` drift detection
- Score history tracking

### v0.5 — Community
- Community target registry
- `palade targets search/add` commands
- Target pack publishing guide

### v1.0 — Stable Release
- GitHub Actions workflow template
- Full documentation site
- Stable API for custom agent plugins
- Score badge CDN

---

## 9. Constraints & Principles

- **Open source first** — MIT licensed, no telemetry without explicit opt-in
- **BYOK always** — no Palade-hosted API keys, ever
- **Zero lock-in** — all output is portable (HTML, JSON, Markdown)
- **Speed is a feature** — Groq parallel execution is the core UX differentiator
- **Output over process** — users should never need to understand the swarm internals to use the tool
