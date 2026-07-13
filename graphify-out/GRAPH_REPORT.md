# Graph Report - Palade  (2026-07-13)

## Corpus Check
- 165 files · ~108,786 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 991 nodes · 2596 edges · 71 communities (50 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `da5ebb64`
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
- Community 74
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
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts
- `CombinedAnalyzer` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts
- `DomainSpec` --references--> `AgentName`  [EXTRACTED]
  src/agents/combined.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/custom/agent.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/architecture.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/deadCode.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/logic.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/maintainability.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/performance.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/pragmatism.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/security.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/registry.ts -> src/agents/specialist/testIntelligence.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/scorer/types.ts -> src/agents/base.ts`

## Communities (71 total, 21 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.31
Nodes (7): SEVERITY_PENALTY, DEFAULT_CONFIG, ProviderConfigSchema, NOTE: applied PER-KIND, not to the combined file total — 'full' and, ReportFormatSchema, DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS, DEFAULT_PENALTY_CAPS

### Community 1 - "base.ts"
Cohesion: 0.21
Nodes (14): annotateComplexity(), buildChunkContext(), buildSystemPrompt(), completeAndParseFindings(), computeMaxTokens(), isParseFailureSentinel(), parseFindingsResponse(), salvageTruncatedArray() (+6 more)

### Community 2 - "html.ts"
Cohesion: 0.17
Nodes (25): BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor(), getScoreGradeClass(), getTemplatePath() (+17 more)

### Community 3 - "settings.ts"
Cohesion: 0.16
Nodes (17): ProviderId, PROVIDERS, quoteKeyIfNeeded(), readCurrentKeys(), resolveConfigPath(), saveApiKey(), saveConfigValue(), setNestedValue() (+9 more)

### Community 4 - "diff.ts"
Cohesion: 0.06
Nodes (53): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), addedLineRanges(), buildFingerprint() (+45 more)

### Community 5 - "contextPacks.ts"
Cohesion: 0.42
Nodes (6): fingerprintFor(), getMatchingChunkAndClamp(), normalizePath(), normalizePathKey(), chunks, validateAndFingerprintFindings()

### Community 6 - "harness.test.ts"
Cohesion: 0.07
Nodes (43): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+35 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.10
Nodes (35): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAG_STRINGS (+27 more)

### Community 8 - "types.ts"
Cohesion: 0.09
Nodes (17): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, formatErrorMessages(), handleFatalError(), CliExitError, NoProvidersError, OllamaNotRunningError (+9 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.27
Nodes (11): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+3 more)

### Community 11 - "history.ts"
Cohesion: 0.33
Nodes (5): BadgeColor, BadgeData, CATEGORY_LABELS, CategoryScore, ScoreBreakdown

### Community 12 - "package.json"
Cohesion: 0.05
Nodes (43): author, bin, palade, bugs, url, description, devDependencies, eslint (+35 more)

### Community 13 - "types.ts"
Cohesion: 0.19
Nodes (17): Severity, SynthesisResult, SynthesizeOptions, CrossAgentFinding, SwarmResult, AiConsumableArchitectureIssue, AiConsumableBug, AiConsumableReport (+9 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.05
Nodes (40): Palade Benchmark Report, Precision — mature libraries, Recall — planted vulnerabilities, Reliability — read this before trusting any single run, Reproduce, Setup, 🏆 Benchmarks, 🔁 CI/CD Integration (+32 more)

### Community 15 - "markdown.ts"
Cohesion: 0.27
Nodes (15): buildMarkdownReport(), createMarkdownTable(), DEFAULT_OPTIONS, escapeMarkdown(), renderAgentTimings(), renderCategoryScoresTable(), renderCrossAgentFindings(), renderFindingsDetail() (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 18 - "terminal.ts"
Cohesion: 0.05
Nodes (58): ReviewMode, reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, scoreCommand(), escapeRegex(), getLanguage(), resolveSymbol() (+50 more)

### Community 19 - "badge.ts"
Cohesion: 0.33
Nodes (4): Codebase Knowledge Graph (graphify) — Read This First, Cross-Session Memory (claude-mem) — Opt-In, graphify, Palade: Mental Model \& Architecture Guide

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 23 - "GroqProvider"
Cohesion: 0.20
Nodes (7): AuthError, OpenAIChoice, OpenAIResponse, OpenAIUsage, OpenAIChoice, OpenAIResponse, OpenAIUsage

### Community 26 - "createLimiter"
Cohesion: 0.09
Nodes (5): createLimiter(), CerebrasProvider, GroqProvider, OpenCodeZenProvider, OpenRouterProvider

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (23): AgentContext, AnnotationSummary, DEFAULT_DOMAINS, applyLineIgnores(), parseFile(), parseFileAsync(), stripStringLiterals(), Annotation (+15 more)

### Community 29 - "calculator.ts"
Cohesion: 0.23
Nodes (13): applyComplexityMultiplier(), calculateCategoryScore(), calculateCrossAgentPenalty(), calculateScore(), calculateTotalPenalty(), ComplexityPenalties, countBySeverity(), CrossAgentPenaltyWeights (+5 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.25
Nodes (10): highestSeverity(), SEVERITY_ORDER, groupBySeverity(), isNearMatch(), jaccardSimilarity(), mergeFindings(), mergeTwo(), NearMatchOptions (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.14
Nodes (14): AgentName, DummyAgent, BaseSpecialistAgent, AGENT_REGISTRY, BUILTIN_AGENTS, getAgentsForMode(), ArchitectureAgent, DeadCodeAgent (+6 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "IProvider"
Cohesion: 0.07
Nodes (20): IProvider, isFatalAuthError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, AllProvidersExhaustedError, createProviderInstances() (+12 more)

### Community 63 - "Community 63"
Cohesion: 0.25
Nodes (8): DEBOUNCE_MS, EstimateResult, estimateRunCost(), getProviderModelKey(), PRICING_TABLE, CodeChunk, scheduleBatches(), SplitResult

### Community 67 - "Community 67"
Cohesion: 0.08
Nodes (32): dependencies, chalk, chokidar, commander, dotenv, ignore, ink, ink-spinner (+24 more)

### Community 70 - "Community 70"
Cohesion: 0.13
Nodes (14): PaladeConfig, App(), AppProps, SafeInputHandlerProps, CommandInput(), CommandInputProps, OutputLine, OutputLineItem() (+6 more)

### Community 74 - "Community 74"
Cohesion: 0.36
Nodes (8): computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis(), synthesize()

### Community 77 - "Community 77"
Cohesion: 0.22
Nodes (16): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+8 more)

### Community 81 - "Community 81"
Cohesion: 0.21
Nodes (8): IAgent, AGENT_NAME_ALIASES, attributeFindings(), buildCombinedSystemPrompt(), CombinedAnalyzer, DOMAIN_GUARDRAILS, DomainSpec, normalizeAgentName()

### Community 91 - "Community 91"
Cohesion: 0.22
Nodes (12): BUILTIN_NAMES, isProviderConfigured(), buildEnvConfig(), collectKeys(), expandProviderShares(), formatZodError(), loadConfig(), getFallbackChain() (+4 more)

### Community 93 - "Community 93"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 102 - "Community 102"
Cohesion: 0.21
Nodes (6): AgentFinding, AgentMemory, analyze(), makeChunk(), makeContext(), runOneBatchWithTimeout()

## Knowledge Gaps
- **237 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+232 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 67` to `package.json`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `Community 67` to `Community 63`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `diff.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06409130816505706 - nodes in this community are weakly interconnected._
- **Should `harness.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07058001397624039 - nodes in this community are weakly interconnected._
- **Should `useCommandRunner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09565217391304348 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09309309309309309 - nodes in this community are weakly interconnected._