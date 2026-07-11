# Graph Report - .  (2026-07-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1763 nodes · 4875 edges · 115 communities (96 shown, 19 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `20ea49cc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_router.ts|router.ts]]
- [[_COMMUNITY_base.ts|base.ts]]
- [[_COMMUNITY_html.ts|html.ts]]
- [[_COMMUNITY_settings.ts|settings.ts]]
- [[_COMMUNITY_diff.ts|diff.ts]]
- [[_COMMUNITY_contextPacks.ts|contextPacks.ts]]
- [[_COMMUNITY_harness.test.ts|harness.test.ts]]
- [[_COMMUNITY_useCommandRunner.ts|useCommandRunner.ts]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_repoContext.ts|repoContext.ts]]
- [[_COMMUNITY_base.ts|base.ts]]
- [[_COMMUNITY_history.ts|history.ts]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_🤖 Palade|🤖 Palade]]
- [[_COMMUNITY_markdown.ts|markdown.ts]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_cerebras.ts|cerebras.ts]]
- [[_COMMUNITY_terminal.ts|terminal.ts]]
- [[_COMMUNITY_badge.ts|badge.ts]]
- [[_COMMUNITY_Palade Agent Quality Diagnostic — Baseline Run|Palade Agent Quality Diagnostic — Baseline Run]]
- [[_COMMUNITY_triage.test.ts|triage.test.ts]]
- [[_COMMUNITY_dependencies|dependencies]]
- [[_COMMUNITY_GroqProvider|GroqProvider]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_scripts|scripts]]
- [[_COMMUNITY_createLimiter|createLimiter]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_calculator.ts|calculator.ts]]
- [[_COMMUNITY_1.0.0-rc.1 - 2026-06-27|[1.0.0-rc.1] - 2026-06-27]]
- [[_COMMUNITY_AgentFinding|AgentFinding]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Contributing to Palade|Contributing to Palade]]
- [[_COMMUNITY_IProvider|IProvider]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_repository|repository]]
- [[_COMMUNITY_inventory.json|inventory.json]]
- [[_COMMUNITY_vulnerable.ts|vulnerable.ts]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_review.ts|review.ts]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_OpenCodeZenProvider|OpenCodeZenProvider]]
- [[_COMMUNITY_OpenRouterProvider|OpenRouterProvider]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_session-start.sh|session-start.sh]]
- [[_COMMUNITY_inventory|inventory]]
- [[_COMMUNITY_Commands|Commands]]
- [[_COMMUNITY_Configuration Economy Mode|Configuration: Economy Mode]]
- [[_COMMUNITY_Configure a Provider|Configure a Provider]]
- [[_COMMUNITY_Getting Started|Getting Started]]
- [[_COMMUNITY_Installation|Installation]]
- [[_COMMUNITY_Interactive TUI|Interactive TUI]]
- [[_COMMUNITY_`palade targets`|`palade targets`]]
- [[_COMMUNITY_What is Palade|What is Palade?]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 114|Community 114]]

## God Nodes (most connected - your core abstractions)
1. `diffCommand()` - 40 edges
2. `AgentName` - 38 edges
3. `AgentName` - 38 edges
4. `AgentFinding` - 37 edges
5. `AgentFinding` - 37 edges
6. `diffCommand()` - 34 edges
7. `reviewCommand()` - 34 edges
8. `CodeChunk` - 34 edges
9. `reviewCommand()` - 33 edges
10. `CodeChunk` - 33 edges

## Surprising Connections (you probably didn't know these)
- `reviewCommand()` --calls--> `traceDependencies()`  [INFERRED]
  src/cli/commands/review.ts → src/ingestion/dependencyTracer.ts
- `reviewCommand()` --calls--> `printGhostBanner()`  [INFERRED]
  src/cli/commands/review.ts → src/ui/banner.ts
- `buildIgnoreFilter()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `walkDir()` --references--> `ignore`  [EXTRACTED]
  src/ingestion/walker.ts → package.json
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts

## Import Cycles
- 2-file cycle: `src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/schema.ts`
- 3-file cycle: `src/agents/custom/agent.ts -> src/agents/custom/schema.ts -> src/agents/registry.ts -> src/agents/custom/agent.ts`
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/scorer/types.ts -> src/agents/base.ts`

## Communities (115 total, 19 thin omitted)

### Community 0 - "router.ts"
Cohesion: 0.17
Nodes (22): AgentContext, annotateComplexity(), buildChunkContext(), buildSystemPrompt(), computeMaxTokens(), IAgent, parseFindingsResponse(), salvageTruncatedArray() (+14 more)

### Community 1 - "base.ts"
Cohesion: 0.15
Nodes (25): AgentContext, annotateComplexity(), buildChunkContext(), buildSystemPrompt(), computeMaxTokens(), parseFindingsResponse(), salvageTruncatedArray(), unparsableResponseFinding() (+17 more)

### Community 2 - "html.ts"
Cohesion: 0.17
Nodes (25): BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor(), getScoreGradeClass(), getTemplatePath() (+17 more)

### Community 3 - "settings.ts"
Cohesion: 0.17
Nodes (16): ProviderId, PROVIDERS, readCurrentKeys(), resolveConfigPath(), saveApiKey(), saveConfigValue(), setNestedValue(), fetchModels() (+8 more)

### Community 4 - "diff.ts"
Cohesion: 0.21
Nodes (16): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), OptionalDocResult, readOptionalProjectDoc(), rankIntroducedFindings(), getBaseScore() (+8 more)

### Community 5 - "contextPacks.ts"
Cohesion: 0.38
Nodes (9): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+1 more)

### Community 6 - "harness.test.ts"
Cohesion: 0.10
Nodes (23): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+15 more)

### Community 7 - "useCommandRunner.ts"
Cohesion: 0.13
Nodes (29): decisionsCommand(), runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted(), VALUE_FLAGS (+21 more)

### Community 8 - "types.ts"
Cohesion: 0.12
Nodes (13): formatErrorMessages(), handleFatalError(), CliExitError, NoProvidersError, OllamaNotRunningError, PaladeConfigError, SwarmTimeoutError, TargetNotFoundError (+5 more)

### Community 9 - "repoContext.ts"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "base.ts"
Cohesion: 0.25
Nodes (14): CompletionRequest, CompletionResponse, FATAL_QUOTA_KEYWORDS, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage() (+6 more)

### Community 11 - "history.ts"
Cohesion: 0.17
Nodes (17): acquireLock(), appendEntry(), getPreviousScore(), isValidCategoryScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep() (+9 more)

### Community 12 - "package.json"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 13 - "types.ts"
Cohesion: 0.23
Nodes (10): AiConsumableArchitectureIssue, AiConsumableBug, AiConsumableReport, buildJsonReport(), reportJson(), HtmlTemplateData, MarkdownTableOptions, ReporterFormat (+2 more)

### Community 14 - "🤖 Palade"
Cohesion: 0.15
Nodes (12): ?? Advanced Configuration, ??? CLI Commands, Economy Mode, 🤖 Palade, `palade diff`, `palade review`, `palade score`, `palade watch` (+4 more)

### Community 15 - "markdown.ts"
Cohesion: 0.29
Nodes (14): buildMarkdownReport(), createMarkdownTable(), DEFAULT_OPTIONS, escapeMarkdown(), renderAgentTimings(), renderCategoryScoresTable(), renderCrossAgentFindings(), renderFindingsDetail() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 17 - "cerebras.ts"
Cohesion: 0.29
Nodes (3): AuthError, AllProvidersExhaustedError, dummyReq

### Community 18 - "terminal.ts"
Cohesion: 0.16
Nodes (22): scoreCommand(), formatDelta(), printDiffSummary(), renderCategoryScore(), renderFinding(), renderScoreBar(), reportTerminal(), SEVERITY_COLORS (+14 more)

### Community 19 - "badge.ts"
Cohesion: 0.12
Nodes (17): AgentName, DummyAgent, BaseSpecialistAgent, ReviewMode, AGENT_REGISTRY, BUILTIN_AGENTS, getAgentsForMode(), GHOST_MODE (+9 more)

### Community 20 - "Palade Agent Quality Diagnostic — Baseline Run"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 22 - "dependencies"
Cohesion: 0.17
Nodes (12): dependencies, chalk, chokidar, commander, dotenv, ink, ink-spinner, ink-text-input (+4 more)

### Community 23 - "GroqProvider"
Cohesion: 0.20
Nodes (4): GroqProvider, OpenAIChoice, OpenAIResponse, OpenAIUsage

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (23): COMMAND_REGISTRY, CommandDef, runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch(), targetsCommand, throwIfAborted() (+15 more)

### Community 25 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, clean, dev, format, format:check, graph:update, lint (+4 more)

### Community 26 - "createLimiter"
Cohesion: 0.08
Nodes (6): createLimiter(), CerebrasProvider, NvidiaProvider, OllamaProvider, OpenCodeZenProvider, OpenRouterProvider

### Community 27 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (24): DEFAULT_DOMAINS, applyLineIgnores(), FileManifest, AgentMemory, runSwarm(), heuristicSelect(), scoreManifestForReview(), triageFiles() (+16 more)

### Community 29 - "calculator.ts"
Cohesion: 0.15
Nodes (19): SEVERITY_PENALTY, DEFAULT_CONFIG, ProviderConfigSchema, ReportFormatSchema, applyComplexityMultiplier(), calculateCategoryScore(), calculateCrossAgentPenalty(), calculateScore() (+11 more)

### Community 30 - "[1.0.0-rc.1] - 2026-06-27"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "AgentFinding"
Cohesion: 0.23
Nodes (11): highestSeverity(), SEVERITY_ORDER, groupBySeverity(), isNearMatch(), jaccardSimilarity(), linesAreNear(), mergeFindings(), mergeTwo() (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (15): AgentName, DummyAgent, BaseSpecialistAgent, AGENT_REGISTRY, BUILTIN_AGENTS, BUILTIN_NAMES, getAgentsForMode(), ArchitectureAgent (+7 more)

### Community 33 - "Contributing to Palade"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "IProvider"
Cohesion: 0.07
Nodes (20): IProvider, isQuotaTaggedError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, ProviderPool, agentAssignments, allProviders, createProviderInstances() (+12 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), rankIntroducedFindings(), scopeToDiff(), changed, ChangedFile (+14 more)

### Community 36 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 45 - "Community 45"
Cohesion: 0.27
Nodes (16): CompletionRequest, CompletionResponse, fetchWithRetry(), isDailyLimitError(), nextRetryMaxTokens(), QUOTA_ERROR_TAG, rateLimitedMessage(), shouldRetryEmptyContent() (+8 more)

### Community 46 - "review.ts"
Cohesion: 0.17
Nodes (18): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, ReviewCancelledError, escapeRegex(), getLanguage(), resolveSymbol(), getModeConfig() (+10 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (20): AgentFinding, Severity, SynthesisResult, SynthesizeOptions, AgentMemory, CrossAgentFinding, SwarmOptions, SwarmResult (+12 more)

### Community 48 - "Community 48"
Cohesion: 0.09
Nodes (22): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+14 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (20): launchPicker(), reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, loadCustomAgents(), escapeRegex(), getLanguage(), resolveSymbol() (+12 more)

### Community 50 - "OpenCodeZenProvider"
Cohesion: 0.10
Nodes (21): FATAL_QUOTA_KEYWORDS, isQuotaTaggedError(), isFatalAuthError(), PoolSourceTaggedError, PROVIDER_POOL_SOURCE, agentAssignments, allProviders, createProviderInstances() (+13 more)

### Community 51 - "OpenRouterProvider"
Cohesion: 0.13
Nodes (14): calculateComplexity(), chunkByAST(), chunkByBrackets(), chunkOneFile(), isComplexityNode(), isRegexStartAllowed(), makeChunkId(), REGEX_ALLOWED_AFTER_KEYWORDS (+6 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (18): SEVERITY_PENALTY, isProviderConfigured(), DEFAULT_CONFIG, buildEnvConfig(), collectKeys(), expandProviderShares(), formatZodError(), loadConfig() (+10 more)

### Community 54 - "inventory"
Cohesion: 0.15
Nodes (23): BADGE_COLOR_HEX, buildTemplateData(), __dirname, escapeHtml(), formatDeltaText(), getScoreColor(), getScoreGradeClass(), getTemplatePath() (+15 more)

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (17): makeHugeSingleLineChunk(), makeMinifiedChunk(), makeMixedChunk(), makeNormalChunk(), makeRelativePathChunk(), makeWindowsPathChunk(), PaladeConfig, estimateTokens() (+9 more)

### Community 64 - "Community 64"
Cohesion: 0.18
Nodes (16): makeHugeSingleLineChunk(), makeMinifiedChunk(), makeMixedChunk(), makeNormalChunk(), makeRelativePathChunk(), makeWindowsPathChunk(), estimateTokens(), EstimateResult (+8 more)

### Community 65 - "Community 65"
Cohesion: 0.13
Nodes (14): CommandInput(), CommandInputProps, OutputLine, OutputLineItem(), SettingsPanel(), useCommandHistory(), useCommandRunner(), useOutputStream() (+6 more)

### Community 66 - "Community 66"
Cohesion: 0.18
Nodes (18): OptionalDocResult, readOptionalProjectDoc(), buildAnnotationSummary(), chunkFiles(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, ScopeOptions (+10 more)

### Community 67 - "Community 67"
Cohesion: 0.16
Nodes (19): ignore, AnnotationSummary, watchCommand(), parseAnnotations(), parseAnnotationsAsync(), parseFile(), parseFileAsync(), stripStringLiterals() (+11 more)

### Community 68 - "Community 68"
Cohesion: 0.11
Nodes (4): createLimiter(), OllamaProvider, OpenCodeZenProvider, OpenRouterProvider

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (18): applyComplexityMultiplier(), calculateCategoryScore(), calculateCrossAgentPenalty(), calculateScore(), calculateTotalPenalty(), ComplexityPenalties, countBySeverity(), CrossAgentPenaltyWeights (+10 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (12): App(), SafeInputHandlerProps, CommandInput(), CommandInputProps, OutputLine, OutputLineItem(), useCommandHistory(), NOTE: lines must stay append-only (no front truncation). Ink's <Static> (+4 more)

### Community 71 - "Community 71"
Cohesion: 0.15
Nodes (15): BUILTIN_NAMES, FOCUS_ORDER, FocusField, ModelFetchState, SettingsPanelProps, ProviderId, quoteKeyIfNeeded(), readCurrentKeys() (+7 more)

### Community 72 - "Community 72"
Cohesion: 0.16
Nodes (9): formatErrorMessages(), handleFatalError(), NoProvidersError, OllamaNotRunningError, PaladeConfigError, SwarmTimeoutError, TargetNotFoundError, WorkspaceTooLargeError (+1 more)

### Community 73 - "Community 73"
Cohesion: 0.19
Nodes (18): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+10 more)

### Community 74 - "Community 74"
Cohesion: 0.20
Nodes (14): AgentFinding, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+6 more)

### Community 75 - "Community 75"
Cohesion: 0.15
Nodes (14): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+6 more)

### Community 76 - "Community 76"
Cohesion: 0.12
Nodes (5): IProvider, ProviderPool, FallbackProvider, getFallbackStats(), ProviderAssignment

### Community 77 - "Community 77"
Cohesion: 0.23
Nodes (15): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+7 more)

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (15): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), getBaseScore(), getChangedFiles(), getCurrentBranch(), getFileContentAtRef() (+7 more)

### Community 79 - "Community 79"
Cohesion: 0.22
Nodes (13): decisionsCommand(), scoreCommand(), BLOCKS, drawBox(), formatDelta(), formatDriftAlert(), sectionBox(), severityChip() (+5 more)

### Community 80 - "Community 80"
Cohesion: 0.26
Nodes (14): initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand(), SettingsOptions (+6 more)

### Community 81 - "Community 81"
Cohesion: 0.19
Nodes (9): IAgent, Severity, CombinedAnalyzer, CustomAgent, loadCustomAgents(), CustomAgentDefinition, CustomAgentDefinitionSchema, SynthesizeOptions (+1 more)

### Community 82 - "Community 82"
Cohesion: 0.17
Nodes (9): AnnotationSummary, applyLineIgnores(), parseAnnotations(), parseAnnotationsAsync(), Annotation, analyze(), makeChunk(), makeContext() (+1 more)

### Community 83 - "Community 83"
Cohesion: 0.24
Nodes (13): buildMarkdownReport(), createMarkdownTable(), DEFAULT_OPTIONS, renderAgentTimings(), renderCategoryScoresTable(), renderCrossAgentFindings(), renderFindingsDetail(), renderFindingsSummary() (+5 more)

### Community 84 - "Community 84"
Cohesion: 0.24
Nodes (11): acquireLock(), appendEntry(), getPreviousScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep(), tmpDirs (+3 more)

### Community 85 - "Community 85"
Cohesion: 0.20
Nodes (13): watchCommand(), parseFile(), parseFileAsync(), stripStringLiterals(), LanguageProfile, buildIgnoreFilter(), DEFAULT_IGNORES, detectLanguage() (+5 more)

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (10): highestSeverity(), SEVERITY_ORDER, groupBySeverity(), isNearMatch(), jaccardSimilarity(), mergeFindings(), mergeTwo(), NearMatchOptions (+2 more)

### Community 87 - "Community 87"
Cohesion: 0.29
Nodes (12): calculateComplexity(), calculateComplexityForNodes(), chunkByAST(), chunkByBrackets(), chunkFiles(), chunkOneFile(), getTopLevelSymbolName(), isComplexityNode() (+4 more)

### Community 88 - "Community 88"
Cohesion: 0.21
Nodes (10): runClassicCLI(), Header(), HeaderProps, PROVIDERS, ASCII_ART, GRADIENT, BannerOptions, printBanner() (+2 more)

### Community 89 - "Community 89"
Cohesion: 0.26
Nodes (10): addedLineRanges(), buildFingerprint(), buildLooseFingerprint(), compareFindings(), findingOverlapsAdded(), scopeToDiff(), changed, ChangedFile (+2 more)

### Community 90 - "Community 90"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 91 - "Community 91"
Cohesion: 0.26
Nodes (9): isProviderConfigured(), buildEnvConfig(), collectKeys(), formatZodError(), loadConfig(), PaladeConfigSchema, __dirname, launchTUI() (+1 more)

### Community 92 - "Community 92"
Cohesion: 0.30
Nodes (7): ReviewMode, DEBT_MODE, GHOST_MODE, ModeConfig, MODES, ONBOARD_MODE, SECURITY_MODE

### Community 93 - "Community 93"
Cohesion: 0.24
Nodes (7): Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), renderAscii()

### Community 94 - "Community 94"
Cohesion: 0.29
Nodes (8): extractLocalImports(), normalizePath(), resolveImport(), extractGoImports(), extractImportSpecifiers(), extractViaAst(), extractViaRegex(), LANGUAGE_IMPORT_PATTERNS

### Community 95 - "Community 95"
Cohesion: 0.33
Nodes (8): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge(), BadgeData, SCORE_THRESHOLDS

### Community 96 - "Community 96"
Cohesion: 0.36
Nodes (8): computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis(), synthesize()

### Community 97 - "Community 97"
Cohesion: 0.25
Nodes (6): VALUE_FLAG_STRINGS, VALUE_FLAGS, configIdx, __dirname, pkg, rawArgs

### Community 98 - "Community 98"
Cohesion: 0.42
Nodes (6): fingerprintFor(), getMatchingChunkAndClamp(), normalizePath(), normalizePathKey(), chunks, validateAndFingerprintFindings()

### Community 99 - "Community 99"
Cohesion: 0.28
Nodes (7): VALUE_FLAG_STRINGS, configIdx, __dirname, launchTUI(), pkg, rawArgs, runClassicCLI()

### Community 101 - "Community 101"
Cohesion: 0.43
Nodes (7): formatDelta(), renderCategoryScore(), renderFinding(), renderScoreBar(), reportTerminal(), SEVERITY_COLORS, scoreGrade()

### Community 102 - "Community 102"
Cohesion: 0.36
Nodes (4): analyze(), makeChunk(), makeContext(), runOneBatchWithTimeout()

### Community 103 - "Community 103"
Cohesion: 0.29
Nodes (3): AuthError, AllProvidersExhaustedError, dummyReq

### Community 108 - "Community 108"
Cohesion: 0.50
Nodes (3): hooks, PreToolUse, SessionStart

### Community 114 - "Community 114"
Cohesion: 0.30
Nodes (11): buildAnnotationSummary(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, ScopeOptions, contextBlockKey(), mergeContexts(), PipelineOptions (+3 more)

## Knowledge Gaps
- **322 isolated node(s):** `session-start.sh script`, `PATH`, `SessionStart`, `PreToolUse`, `allow` (+317 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `Community 67`, `package.json`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `ignore` connect `Community 67` to `dependencies`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `buildIgnoreFilter()` connect `Community 67` to `Community 81`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `session-start.sh script`, `PATH`, `SessionStart` to the rest of the system?**
  _323 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `base.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14839424141749724 - nodes in this community are weakly interconnected._
- **Should `harness.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09788359788359788 - nodes in this community are weakly interconnected._
- **Should `useCommandRunner.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1251778093883357 - nodes in this community are weakly interconnected._