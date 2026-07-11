# Palade Hybrid Swarm — Benchmark Report

Statistical performance of the Palade Hybrid AI Engine, run as a dual-provider swarm:
**OpenRouter** (`tencent/hy3:free`) for complex domains, **OpenCode Zen** for baseline validation.

## 1. Dataset

Five production-grade codebases spanning diverse domains, architectures, and sizes:

| Repository | Domain | Files Analyzed | LOC (Analyzed) |
| :--- | :--- | ---: | ---: |
| Sveld | Compiler / AST | 24 | ~3,500 |
| DawnAI | Node.js Backend | 18 | ~2,100 |
| Kreuzakt | Data Export / DB | 12 | ~1,800 |
| Zod (`types.ts`) | Type System / Validation | 1 (capped to 50 chunks) | ~5,139 |
| Axios (`Axios.js`) | HTTP Networking | 1 | ~284 |

## 2. Detection Performance

### A. Seeded bugs (recall)

7 critical bugs were known or seeded in the first three repositories (Sveld, DawnAI,
Kreuzakt). The swarm was tasked with finding them with no prior context.

| Metric | Score | Explanation |
| :--- | :--- | :--- |
| **Recall (known bugs)** | **100% (7/7)** | All 7 target bugs found, including Unbounded Memory Growth in Kreuzakt and a Thread Deadlock in DawnAI |
| **Precision (High/Critical)** | **100%** | Every finding the swarm flagged High or Critical was manually verified by a human as a legitimate, actionable defect |

### B. Previously unreported defects (Zod & Axios)

The swarm was then pointed at unmodified production source of two of the most-downloaded
JavaScript libraries in the world. It surfaced **5 previously unreported defects** that had
passed human code review:

| Library | Severity | Finding |
| :--- | :--- | :--- |
| Axios | Critical | Synchronous interceptor loop swallows exceptions and dispatches requests without validation *(patched — upstream PR opened)* |
| Axios | High | Synchronous interceptor error propagation breaks the interceptor chain |
| Axios | High | Header cleanup ignores the options HTTP method |
| Zod | High | Swallowed runtime exceptions in `_parseSync` logic disguised as async aborts |
| Zod | High | Severe CPU penalty from recompiling `RegExp` objects per-validated-string in `timeRegex` |

## 3. Output Volume

| Metric | Total |
| :--- | :--- |
| Total findings generated | ~250+ |
| Zod findings | 55 (0 Critical, 2 High, 18 Medium, 29 Low, 6 Info) |
| Axios findings | 22 (1 Critical, 3 High, 6 Medium, 10 Low, 2 Info) |
| Arbitration success rate | 100% |

## 4. Arbitration Efficiency

When multiple agents (e.g. Security vs. Pragmatism) flag conflicting resolutions for the
same line of code, the Verdict engine arbitrates.

- **Conflict volume:** in Zod's `types.ts` (5,000+ lines), agents raised **40+ distinct architectural conflicts**
- **Resolution:** 100% synthesized into single coherent verdicts — e.g. recommending a unified typed-error class to replace Zod's brittle string-matching logic

## Conclusion

By routing specialized tasks to frontier models (via OpenRouter) alongside fast baseline
models, the hybrid swarm achieved 100% precision and recall on the seeded-bug set and
surfaced real, previously unreported defects in enterprise-grade libraries. Fixes for
findings are made by humans (or their tools) — Palade reports; it does not write code.

## Methodology notes

- Seeded-bug recall measures detection of *known* defects; real-world recall on unknown defects is inherently unmeasurable.
- Precision was human-verified on High/Critical findings only; lower-severity findings were not exhaustively adjudicated.
- Reproduce with: `palade review --mode standard` against the pinned versions of each target repository, `providerShares` split across OpenRouter + OpenCode Zen.
