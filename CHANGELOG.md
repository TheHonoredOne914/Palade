# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-rc.1] - 2026-06-27

### Added
- **Ollama Provider**: Native support for local, air-gapped LLM execution using Ollama (e.g. `OLLAMA_MODEL=codellama:13b`).
- **Cost Estimation**: Added `--dry-run` flag to preview total tokens, agent scaling limits, and estimated API cost (USD) prior to initiating a review.
- **TUI Gating**: Introduced explicit `tui` subcommand and `--unstable-tui` flag to protect the CLI experience from upstream Ink/React dependency issues.
- **Resiliency**: Exponential backoff integrated across all AI providers. 
- **Telemetry Warnings**: Proactive detection of non-primary languages (e.g., Python, Rust, Go) to explicitly warn users that JS/TS yields the highest fidelity results.

### Changed
- **Provider Error Handling**: Re-engineered routing to cleanly bubble up `AllProvidersExhaustedError` when API quota, rate limiting, and network fallback routes are fully saturated.
- **Terminal Reporter**: Graceful fallback and clear UX recovery instructions on catastrophic swarm failures.

### Security
- **Strict Read-Only Guarantees**: Explicitly documented that `review` and `diff` commands *never* write source code to disk.
- **Target Generation Exception**: Added `SECURITY NOTE` to `targets generate` warning users that it is the sole operation that mutates project state (writing to `palade.targets.ts`).
