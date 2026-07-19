# Graph Report - Palade  (2026-07-19)

## Corpus Check
- 164 files · ~108,987 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 989 nodes · 2583 edges · 70 communities (48 shown, 22 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c0c29a05`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- router.ts
- base.ts
- html.ts
- settings.ts
- diff.ts
- contextPacks.ts
- harness.test.ts
- useCommandRunner.ts
- types.ts
- repoContext.ts
- base.ts
- history.ts
- package.json
- types.ts
- 🤖 Palade
- markdown.ts
- Community 16
- cerebras.ts
- terminal.ts
- badge.ts
- Palade Agent Quality Diagnostic — Baseline Run
- triage.test.ts
- dependencies
- GroqProvider
- Community 24
- scripts
- createLimiter
- devDependencies
- Community 28
- calculator.ts
- [1.0.0-rc.1] - 2026-06-27
- AgentFinding
- Community 32
- Contributing to Palade
- IProvider
- Community 35
- repository
- prompt.ts
- vulnerable.ts
- Community 45
- review.ts
- Community 47
- session-start.sh
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- What is Palade?
- Community 63
- Community 67
- Community 70
- Community 77
- Community 81
- Community 91
- Community 93
- Community 102

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 40 edges
2. `AgentName` - 38 edges
3. `AgentFinding` - 37 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 34 edges
6. `IProvider` - 32 edges
7. `CompletionRequest` - 26 edges
8. `CompletionResponse` - 26 edges
9. `loadConfig()` - 23 edges
10. `runSwarm()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `CombinedAnalyzer` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `DomainSpec` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `CustomAgent` --references--> `AgentName`  [EXTRACTED]
  src/agents/custom/agent.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/custom/agent.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/performance.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/architecture.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/logic.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/security.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/maintainability.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/deadCode.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/pragmatism.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/testIntelligence.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/scorer/types.ts -> src/agents/base.ts`

## Communities (70 total, 22 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.31
Nodes (7): SEVERITY_PENALTY, DEFAULT_CONFIG, ProviderConfigSchema, NOTE: applied PER-KIND, not to the combined file total — 'full' and, ReportFormatSchema, DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS

### Community 1 - "base.ts"
Cohesion: 0.20
Nodes (15): AgentContext, annotateComplexity(), buildChunkContext(), buildSystemPrompt(), completeAndParseFindings(), computeMaxTokens(), isParseFailureSentinel(), parseFindingsResponse() (+7 more)

### Community 2 - "html.ts"
Cohesion: 0.07
Nodes (58): SynthesisResult, SwarmResult, BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor() (+50 more)

### Community 3 - "settings.ts"
Cohesion: 0.16
Nodes (17): ProviderId, PROVIDERS, quoteKeyIfNeeded(), readCurrentKeys(), resolveConfigPath(), saveApiKey(), saveConfigValue(), setNestedValue() (+9 more)

### Community 4 - "diff.ts"
Cohesion: 0.06
Nodes (64): ignore, DiffContext, diffCommand(), DiffOpts, throwIfAborted(), watchCommand(), OptionalDocResult, readOptionalProjectDoc() (+56 more)

### Community 5 - "contextPacks.ts"
Cohesion: 0.13
Nodes (15): scripts, build, clean, dev, format, format:check, graph:update, lint (+7 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.06
Nodes (47): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+39 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.07
Nodes (43): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAG_STRINGS (+35 more)

### Community 8 - "types.ts"
Cohesion: 0.27
Nodes (4): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, PaladeConfigError

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.30
Nodes (14): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+6 more)

### Community 11 - "history.ts"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.05
Nodes (40): Palade Benchmark Report, Precision — mature libraries, Recall — planted vulnerabilities, Reliability — read this before trusting any single run, Reproduce, Setup, 🏆 Benchmarks, 🔁 CI/CD Integration (+32 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 18 - "terminal.ts"
Cohesion: 0.05
Nodes (54): ReviewMode, reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, scoreCommand(), launchPicker(), ReviewCancelledError, escapeRegex() (+46 more)

### Community 19 - "badge.ts"
Cohesion: 0.33
Nodes (4): Codebase Knowledge Graph (graphify) — Read This First, Cross-Session Memory (claude-mem) — Opt-In, graphify, Palade: Mental Model \& Architecture Guide

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "dependencies"
Cohesion: 0.11
Nodes (5): IProvider, NvidiaProvider, FallbackProvider, markResponsibleProviderDead(), ProviderAssignment

### Community 23 - "GroqProvider"
Cohesion: 0.14
Nodes (8): AuthError, NoProvidersError, OllamaNotRunningError, SwarmTimeoutError, TargetNotFoundError, isFatalAuthError(), AllProvidersExhaustedError, dummyReq

### Community 26 - "createLimiter"
Cohesion: 0.13
Nodes (6): createLimiter(), GroqProvider, OpenAIChoice, OpenAIResponse, OpenAIUsage, OpenCodeZenProvider

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (24): DEFAULT_DOMAINS, applyLineIgnores(), linesAreNear(), estimateTotalTokens(), runSwarm(), heuristicSelect(), scoreManifestForReview(), triageFiles() (+16 more)

### Community 29 - "calculator.ts"
Cohesion: 0.07
Nodes (41): Severity, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+33 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (14): AgentName, DummyAgent, BaseSpecialistAgent, AGENT_REGISTRY, BUILTIN_AGENTS, getAgentsForMode(), ArchitectureAgent, DeadCodeAgent (+6 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "IProvider"
Cohesion: 0.14
Nodes (15): PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, createProviderInstances(), FallbackStats, getFallbackChain(), initRouter() (+7 more)

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (11): AnnotationSummary, IAgent, DEBOUNCE_MS, parseFileAsync(), stripStringLiterals(), Annotation, CodeChunk, FileManifest (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.17
Nodes (12): dependencies, chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input (+4 more)

### Community 70 - "Community 70"
Cohesion: 0.12
Nodes (16): PaladeConfig, ScopeOptions, PipelineOptions, App(), AppProps, SafeInputHandlerProps, CommandInput(), CommandInputProps (+8 more)

### Community 77 - "Community 77"
Cohesion: 0.26
Nodes (14): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+6 more)

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (12): AGENT_NAME_ALIASES, attributeFindings(), CombinedAnalyzer, DOMAIN_GUARDRAILS, DomainSpec, normalizeAgentName(), fingerprintFor(), getMatchingChunkAndClamp() (+4 more)

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (10): BUILTIN_NAMES, isProviderConfigured(), buildEnvConfig(), collectKeys(), expandProviderShares(), formatZodError(), loadConfig(), __dirname (+2 more)

### Community 93 - "Community 93"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 102 - "Community 102"
Cohesion: 0.19
Nodes (7): AgentFinding, AgentMemory, analyze(), makeChunk(), makeContext(), runOneBatchWithTimeout(), Conflict

## Knowledge Gaps
- **239 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+234 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ignore` connect `diff.ts` to `Community 67`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 67` to `package.json`, `diff.ts`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `diff.ts` to `Community 63`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _241 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `html.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06573426573426573 - nodes in this community are weakly interconnected._
- **Should `diff.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05759623861298854 - nodes in this community are weakly interconnected._
- **Should `contextPacks.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._