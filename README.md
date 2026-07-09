<div align="center">
  
# ?? Palade

**The AI-Powered Codebase Intelligence Engine**

[![npm version](https://img.shields.io/npm/v/palade.svg?style=for-the-badge&color=blue)](https://npmjs.org/package/palade)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)]()

*Palade isn't just a single bot. It's a highly orchestrated **swarm of specialized AI agents** that debate, arbitrate, and synthesize to find zero-day vulnerabilities and architectural flaws in your codebase.*

![Palade TUI](assets/tui.png)

</div>

---

## ?? Why Palade?

Traditional AI coding assistants send your entire file to a single language model. Palade uses a specialized multi-agent architecture to mimic a real software engineering team:

1. **??? Triage Agent:** Scans your repository and figures out which files contain the most risk.
2. **??? Specialist Agents:** We run multiple distinct agents concurrently over the same code:
   - *Security, Architecture, Performance, Maintainability, Dead Code, and Test Intelligence.*
3. **?? Arbitration Engine:** If the *Security* agent and the *Pragmatism* agent disagree on a line of code, the Arbitration engine steps in to resolve the conflict.
4. **?? Synthesis Agent:** Compiles the cross-cutting findings into a prioritized, actionable HTML and Markdown report.

> **?? Proven in Production**  
> In rigorous benchmarking, the Palade Hybrid Swarm achieved **100% Precision and 100% Recall** on known critical bugs. It even discovered and patched **Zero-Day vulnerabilities in `Axios` and `Zod`** that had bypassed thousands of human code reviews.

---

## ? Quick Start

Install Palade globally via npm:

```bash
npm install -g palade
```

Initialize Palade in your project to create the `palade.config.ts`:

```bash
palade init
```

Launch the interactive Terminal User Interface (TUI):

```bash
palade
```

---

## ?? Provider Support (100% Free Tier Available)

Palade runs entirely on your local machine and communicates directly with your LLM provider of choice. We support hybrid routing, meaning you can assign heavy tasks to frontier models and light tasks to hyper-fast local models.

| Provider | Environment Variable | Notes |
| :--- | :--- | :--- |
| **OpenRouter** | `OPENROUTER_API_KEY` | Best for heavy agents (e.g., `tencent/hy3:free` or `claude-3.5-sonnet`). |
| **OpenCode-Zen** | `OPENCODE_ZEN_API_KEY` | Default. Excellent for syntax and fast checks (e.g., `mimo-v2.5-free`). |
| **Ollama (Local)** | `OLLAMA_MODEL` | 100% private, offline inference. |
| **Groq** / **Cerebras** | `GROQ_API_KEY` | LPU-powered execution for analyzing massive monorepos in seconds. |
| **Nvidia** | `NVIDIA_API_KEY` | Access to massive parameter models like Nemotron. |

---

## ??? CLI Commands

You can run Palade directly from your terminal or CI/CD pipeline:

### `palade review`
Run a full swarm review over your project.
```bash
palade review
palade review --file src/core/Auth.ts  # Target a specific file
palade review --target backend         # Review a pre-configured target area
```
*Outputs a stunning interactive HTML report and a Markdown summary.*

### `palade diff`
Review **only** the files that have changed since your main branch or last commit. Perfect for CI pipelines.
```bash
palade diff --base main
```

### `palade watch`
Run the review daemon in the background. It watches your files for changes, debounces them, and automatically runs a review.
```bash
palade watch
```

### `palade score`
Check your codebase health score and view your score trajectory over time.
```bash
palade score
```

---

## ?? Advanced Configuration

### The Hybrid Swarm
You can configure exactly which provider handles which agent in your `palade.config.ts`. For example, a $0 budget setup:
```typescript
export default {
  swarm: {
    primary: "opencode-zen",
    agentProviders: {
      security: "openrouter",
      architecture: "openrouter",
    },
  },
  providers: {
    openrouter: { model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    "opencode-zen": { model: "mimo-v2.5-free" }
  }
}
```

### Economy Mode
By default, Palade runs in **Economy Mode**, meaning all specialist lenses are evaluated in a single API call per chunk to drastically reduce API costs. If you want maximum prompt richness per domain, disable it in your config:
```typescript
  swarm: {
    economyMode: false,
  }
```

---

<div align="center">
  <b>Built for modern codebases. Designed to catch what humans miss.</b>
</div>
