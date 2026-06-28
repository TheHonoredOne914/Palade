# Palade: Pre-Release Overview

This document provides a comprehensive, objective look at what Palade is, its flagship features, its architecture, and its security model. This is intended to give a clear, "no sugar coating" assessment of the tool ahead of its release.

---

## 1. Core Concept

**Palade** is an AI-powered codebase intelligence engine. Instead of relying on traditional static analysis rules (like ESLint or SonarQube), it uses a multi-agent AI swarm to review code. It splits your codebase into semantic chunks and feeds them to specialized agents (Security, Architecture, Performance, Maintainability, Dead Code, and Test Intelligence) to find deep, contextual issues that simple regex or AST parsers miss.

---

## 2. Flagship Features

### AI-Assisted Target Generation
In large codebases, reviewing everything is too expensive and noisy. Palade allows users to define **Targets** (subsystems or specific features). 
**The killer feature:** Users with zero developer experience don't need to know file paths. By running \`npx palade targets generate "Authentication flow"\`, Palade uses AI to search the directory structure, identify the relevant files, and automatically map out the target for review.

### Specialized Agent Swarm
Code is reviewed concurrently by a swarm of specialized agents. Each agent receives a custom system prompt designed to hone in on specific domains (e.g., the Security agent looks for injection flaws; the Architecture agent looks for coupling). A final **Synthesis Agent** deduplicates findings, scores the project (0-100), and provides high-priority recommendations.

### Robust Multi-Provider Routing
LLM APIs are notoriously flaky (rate limits, 500 errors, timeouts). Palade implements a robust **Fallback Provider** router. If a primary provider (like Groq) throws a 429 or 500 error, Palade seamlessly catches it and immediately routes the request to a secondary provider (like OpenRouter or Cerebras) without dropping the user's review process.

### Rich Reporting
Palade generates interactive HTML reports, Markdown summaries, and CI-friendly JSON outputs. It also tracks the health of the project over time, outputting historical data and generating score badges (e.g., \`85/100\`) that can be embedded in a repository's README.

---

## 3. Security Model (No Sugar Coating)

### API Key Management
Palade is designed to protect user secrets. 
* **Zero Hardcoding**: Palade strictly enforces loading API keys exclusively from environment variables (e.g., \`process.env.GROQ_API_KEY\`). 
* **No Accidental Commits**: We actively removed the ability to hardcode API keys into \`palade.config.ts\`. This prevents users from accidentally pushing their sensitive provider keys to public GitHub repositories.
* **Auto-Detection**: The user experience is frictionless. You do not need to configure which provider to use. Palade detects which API key is exported in your environment and automatically routes the swarm to that provider.

### Code Exfiltration & Privacy
* **External API Calls**: When running Palade, the user's source code is chunked and transmitted via HTTPS to third-party LLM APIs (Groq, Cerebras, Nvidia, OpenRouter, etc.). 
* **Enterprise Risk**: Users must be aware that their proprietary code is leaving their local network when using external providers.
* **Local Execution (Ollama):** Palade supports fully local, air-gapped execution via Ollama. Set `OLLAMA_MODEL=<model>` and run `ollama serve` before executing. In this mode, no source code leaves the local machine.

### Sandboxed Analysis (Read-Only)
Palade is strictly an **observability and auditing tool**. 
* **Zero-Modification Policy**: The `review` command and its underlying agents have absolutely zero capability to mutate, refactor, or delete the user's source code.
* **File System Access**: The `walker` reads the directory recursively, but no write permissions are granted to the AST chunker or the agents. The only disk writes occur inside the `.palade/reports` directory when rendering the final HTML/JSON payloads.

* **Exception — Target Generation**: The `targets generate` command is the ONLY command in the entire CLI that modifies project files (it writes to `palade.targets.ts`). It should be audited by security teams independently if strictly locking down file writes.

### Output Escaping & XSS Protections
Palade generates HTML reports based on AI output. AI output is fundamentally untrusted data. 
* **Strict Escaping**: The HTML reporter applies strict XML/HTML escaping to all AI-generated titles, descriptions, and user-provided target names to prevent Cross-Site Scripting (XSS) or layout injection in the resulting web reports.

---

## 4. Current Limitations & Considerations
- **Token Costs**: Running a 6-agent swarm over a massive codebase is highly token-intensive. While economy mode exists, standard swarm operation can quickly burn through rate limits on free API tiers.
- **Language Support**: While it handles TypeScript/JavaScript exceptionally well, the chunking and AST-heuristic logic is optimized for C-style syntaxes. Languages like Python or Rust are supported but may not chunk as elegantly.
