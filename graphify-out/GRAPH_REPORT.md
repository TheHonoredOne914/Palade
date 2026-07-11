# Graph Report - .  (2026-07-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 940 nodes · 2539 edges · 54 communities (39 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e3c66331`
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
- scripts
- createLimiter
- devDependencies
- calculator.ts
- [1.0.0-rc.1] - 2026-06-27
- AgentFinding
- Contributing to Palade
- IProvider
- repository
- vulnerable.ts
- review.ts
- OpenCodeZenProvider
- OpenRouterProvider
- session-start.sh
- inventory
- Commands
- Configuration: Economy Mode
- Configure a Provider
- Getting Started
- Installation
- Interactive TUI
- `palade targets`
- What is Palade?

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 40 edges
2. `AgentName` - 38 edges
3. `AgentFinding` - 37 edges
4. `reviewCommand()` - 34 edges
5. `CodeChunk` - 34 edges
6. `IProvider` - 31 edges
7. `CompletionRequest` - 24 edges
8. `CompletionResponse` - 24 edges
9. `loadConfig()` - 22 edges
10. `BaseSpecialistAgent` - 21 edges

## Surprising Connections (you probably didn't know these)
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `SplitResult` --references--> `CodeChunk`  [EXTRACTED]
  src/orchestrator/scheduler.ts → src/ingestion/types.ts
- `AgentMemory` --references--> `AgentName`  [EXTRACTED]
  src/orchestrator/memory.ts → src/agents/base.ts
- `CrossAgentFinding` --references--> `AgentName`  [EXTRACTED]
  src/orchestrator/types.ts → src/agents/base.ts

## Import Cycles
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/scorer/types.ts -> src/agents/base.ts`

## Communities (54 total, 15 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.14
Nodes (17): isQuotaTaggedError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, createProviderInstances(), FallbackStats, getFallbackChain() (+9 more)

### Community 1 - "base.ts"
Cohesion: 0.07
Nodes (47): AgentContext, AgentName, DummyAgent, annotateComplexity(), BaseSpecialistAgent, buildChunkContext(), buildSystemPrompt(), computeMaxTokens() (+39 more)

### Community 2 - "html.ts"
Cohesion: 0.17
Nodes (25): BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor(), getScoreGradeClass(), getTemplatePath() (+17 more)

### Community 3 - "settings.ts"
Cohesion: 0.05
Nodes (58): SEVERITY_PENALTY, applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+50 more)

### Community 4 - "diff.ts"
Cohesion: 0.05
Nodes (75): ignore, AnnotationSummary, DiffContext, diffCommand(), DiffOpts, throwIfAborted(), watchCommand(), OptionalDocResult (+67 more)

### Community 5 - "contextPacks.ts"
Cohesion: 0.17
Nodes (17): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+9 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.09
Nodes (32): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+24 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.09
Nodes (36): decisionsCommand(), initCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted() (+28 more)

### Community 8 - "types.ts"
Cohesion: 0.10
Nodes (17): loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, BUILTIN_NAMES, formatErrorMessages(), handleFatalError(), CliExitError, NoProvidersError (+9 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.29
Nodes (14): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+6 more)

### Community 11 - "history.ts"
Cohesion: 0.17
Nodes (17): acquireLock(), appendEntry(), getPreviousScore(), isValidCategoryScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep() (+9 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 13 - "types.ts"
Cohesion: 0.24
Nodes (12): SynthesisResult, SwarmResult, AiConsumableReport, buildJsonReport(), reportJson(), HtmlTemplateData, MarkdownTableOptions, ReporterContext (+4 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.15
Nodes (12): ?? Advanced Configuration, ??? CLI Commands, Economy Mode, 🤖 Palade, `palade diff`, `palade review`, `palade score`, `palade watch` (+4 more)

### Community 15 - "markdown.ts"
Cohesion: 0.27
Nodes (15): buildMarkdownReport(), createMarkdownTable(), DEFAULT_OPTIONS, escapeMarkdown(), renderAgentTimings(), renderCategoryScoresTable(), renderCrossAgentFindings(), renderFindingsDetail() (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 17 - "cerebras.ts"
Cohesion: 0.18
Nodes (6): AuthError, OpenAIChoice, OpenAIResponse, OpenAIUsage, AllProvidersExhaustedError, dummyReq

### Community 18 - "terminal.ts"
Cohesion: 0.08
Nodes (29): scoreCommand(), formatDelta(), printDiffSummary(), renderCategoryScore(), renderFinding(), renderScoreBar(), reportTerminal(), SEVERITY_COLORS (+21 more)

### Community 19 - "badge.ts"
Cohesion: 0.46
Nodes (6): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge()

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input (+4 more)

### Community 25 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, clean, dev, format, format:check, graph:update, lint (+4 more)

### Community 26 - "createLimiter"
Cohesion: 0.12
Nodes (4): createLimiter(), CerebrasProvider, NvidiaProvider, OllamaProvider

### Community 27 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 29 - "calculator.ts"
Cohesion: 0.12
Nodes (26): Severity, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+18 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.07
Nodes (38): AgentFinding, addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), findingOverlapsAdded(), rankIntroducedFindings(), scopeToDiff() (+30 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "IProvider"
Cohesion: 0.11
Nodes (5): IProvider, ProviderPool, FallbackProvider, markResponsibleProviderDead(), ProviderAssignment

### Community 36 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 46 - "review.ts"
Cohesion: 0.16
Nodes (16): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, launchPicker(), escapeRegex(), getLanguage(), resolveSymbol(), DEBT_MODE (+8 more)

## Knowledge Gaps
- **198 isolated node(s):** `session-start.sh script`, `PATH`, `name`, `version`, `description` (+193 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ignore` connect `diff.ts` to `dependencies`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `package.json`, `diff.ts`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `diff.ts` to `base.ts`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `name` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `router.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1368421052631579 - nodes in this community are weakly interconnected._
- **Should `base.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07027168234064786 - nodes in this community are weakly interconnected._
- **Should `settings.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05171907140758154 - nodes in this community are weakly interconnected._