# Graph Report - palade  (2026-07-08)

## Corpus Check
- 162 files · ~89,912 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 893 nodes · 2310 edges · 45 communities (42 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `376d3bef`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `AgentName` - 37 edges
2. `AgentFinding` - 37 edges
3. `diffCommand()` - 34 edges
4. `reviewCommand()` - 33 edges
5. `CodeChunk` - 32 edges
6. `IProvider` - 26 edges
7. `CompletionRequest` - 24 edges
8. `CompletionResponse` - 24 edges
9. `BaseSpecialistAgent` - 21 edges
10. `loadConfig()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `reviewCommand()` --calls--> `traceDependencies()`  [INFERRED]
  src/cli/commands/review.ts → src/ingestion/dependencyTracer.ts
- `reviewCommand()` --calls--> `printGhostBanner()`  [INFERRED]
  src/cli/commands/review.ts → src/ui/banner.ts
- `Conflict` --references--> `AgentFinding`  [EXTRACTED]
  src/orchestrator/verdict.ts → src/agents/base.ts
- `findCycles()` --calls--> `normalize()`  [INFERRED]
  src/ingestion/repoContext.ts → src/orchestrator/triage.test.ts
- `walkProject()` --calls--> `normalize()`  [INFERRED]
  src/ingestion/walker.ts → src/orchestrator/triage.test.ts

## Import Cycles
- 3-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/agents/base.ts`
- 4-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/agents/base.ts`
- 5-file cycle: `src/agents/base.ts -> src/providers/router.ts -> src/config/schema.ts -> src/scorer/calculator.ts -> src/orchestrator/types.ts -> src/agents/base.ts`

## Communities (45 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (37): AuthError, CompletionRequest, CompletionResponse, createLimiter(), FATAL_QUOTA_KEYWORDS, fetchWithRetry(), IProvider, isDailyLimitError() (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (46): AgentContext, AgentName, DummyAgent, annotateComplexity(), BaseSpecialistAgent, buildChunkContext(), buildSystemPrompt(), computeMaxTokens() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (63): AgentFinding, Severity, SynthesisResult, DiffResult, FindingDiff, AgentMemory, highestSeverity(), SEVERITY_ORDER (+55 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (44): SEVERITY_PENALTY, computeDebtCounts(), computeDebtHours(), computeGhostHours(), DebtEstimate, parseSynthesisResponse(), PriorityFix, selectFindingsForSynthesis() (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (49): DiffContext, diffCommand(), DiffOpts, throwIfAborted(), watchCommand(), addedLineRanges(), buildFingerprint(), buildLooseFingerprint() (+41 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (40): launchPicker(), initCommand(), applySets(), formatValue(), initConfig(), interactiveSettings(), parseValue(), settingsCommand() (+32 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (39): ALL_DEFECTS, Defect, DefectCategory, FINDING_VALIDATION_DEFECTS, MERGER_DEFECTS, realBugCount(), SCHEDULER_DEFECTS, Severity (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (24): VALUE_FLAGS, decisionsCommand(), COMMAND_REGISTRY, CommandDef, runTargetsAdd(), runTargetsGenerate(), runTargetsList(), runTargetsSearch() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (14): BUILTIN_NAMES, CustomAgentDefinition, CustomAgentDefinitionSchema, formatErrorMessages(), handleFatalError(), CliExitError, NoProvidersError, OllamaNotRunningError (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (13): buildPublicApi(), buildRepoContext(), candidatesFor(), collectStrings(), findCycles(), isTestFile(), renderCappedList(), renderRepoContext() (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.24
Nodes (11): OptionalDocResult, readOptionalProjectDoc(), buildKeywordIndex(), getKeywordContext(), IndexedChunk, ScopeOptions, contextBlockKey(), mergeContexts() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.24
Nodes (6): EstimateResult, estimateRunCost(), getProviderModelKey(), PRICING_TABLE, CodeChunk, scheduleBatches()

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (15): author, bin, palade, bugs, url, description, engines, node (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (10): getAgentsForMode(), FileManifest, runPipeline(), estimateTotalTokens(), runSwarm(), heuristicSelect(), scoreManifestForReview(), triageFiles() (+2 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (14): CLI Commands, Commands, Configuration: Economy Mode, Configure a Provider, Getting Started, Installation, Interactive TUI, Palade (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.26
Nodes (12): buildMarkdownReport(), createMarkdownTable(), DEFAULT_OPTIONS, renderAgentTimings(), renderCategoryScoresTable(), renderCrossAgentFindings(), renderFindingsDetail(), renderFindingsSummary() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, jsx, module, moduleResolution, outDir, resolveJsonModule (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (12): reviewCommand(), ReviewOptions, VALID_REPORT_FORMATS, loadCustomAgents(), escapeRegex(), getLanguage(), resolveSymbol(), getModeConfig() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.30
Nodes (12): scoreCommand(), BLOCKS, drawBox(), formatDelta(), formatDriftAlert(), kvTable(), scoreGrade(), sectionBox() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.23
Nodes (9): runClassicCLI(), Header(), HeaderProps, ASCII_ART, GRADIENT, BannerOptions, printBanner(), printGhostBanner() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (12): Adjudication (ground truth — full repo access), Agent 1: Security, Agent 2: Architecture, Agent 3: Performance, Agent 4: Maintainability, Agent 5: Dead Code, Agent 6: Test Intelligence, Baseline Numbers (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (10): buildRetrievedContext(), expectedTestBases(), getIdentifierTerms(), identifierTerms(), identifierTermsCache, resolveRelativeImport(), scoreRelatedChunk(), toPosix() (+2 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (13): dependencies, chalk, chokidar, commander, dotenv, ignore, ink, ink-spinner (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (8): AnnotationSummary, applyLineIgnores(), parseAnnotations(), parseAnnotationsAsync(), parseFile(), parseFileAsync(), stripStringLiterals(), Annotation

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (9): extractLocalImports(), normalizePath(), resolveImport(), traceDependencies(), extractGoImports(), extractImportSpecifiers(), extractViaAst(), extractViaRegex() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (11): scripts, build, clean, dev, format, format:check, lint, lint:fix (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.20
Nodes (9): Cost Rules, Finding Schema, Palade Audit Pipeline, Phase 1 — Recon (Haiku, parallel), Phase 2 — Deep Audit (Sonnet, parallel per subsystem), Phase 3 — Triage (Opus), Phase 4 — Fix (Sonnet, approved IDs only), Phases (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (10): devDependencies, eslint, @eslint/js, prettier, tsx, @types/node, @types/react, typescript (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.36
Nodes (8): acquireLock(), appendEntry(), getPreviousScore(), parseHistoryEntries(), readHistory(), releaseLock(), sleep(), writeHistory()

### Community 29 - "Community 29"
Cohesion: 0.39
Nodes (7): COLOR_MAP, escapeXml(), getBadgeData(), getScoreColor(), measureTextWidth(), renderBadge(), SCORE_THRESHOLDS

### Community 30 - "Community 30"
Cohesion: 0.25
Nodes (7): [1.0.0-rc.1] - 2026-06-27, [1.0.0-rc.2] - 2026-07-07, Added, Changed, Changelog, Fixed, Security

### Community 31 - "Community 31"
Cohesion: 0.36
Nodes (4): analyze(), makeChunk(), makeContext(), runOneBatchWithTimeout()

### Community 32 - "Community 32"
Cohesion: 0.33
Nodes (4): configIdx, __dirname, pkg, rawArgs

### Community 33 - "Community 33"
Cohesion: 0.33
Nodes (5): Architecture and Scope, Contributing to Palade, Pull Request Process, Setting Up For Development, Testing

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (4): count_lines(), extract_exports(), Extract all export names from a TypeScript file., Count non-empty lines in file.

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **196 isolated node(s):** `inventory`, `name`, `version`, `description`, `type` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AgentFinding` connect `Community 2` to `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 13`, `Community 18`, `Community 23`, `Community 31`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `AgentName` connect `Community 1` to `Community 2`, `Community 4`, `Community 10`, `Community 13`, `Community 17`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `reviewCommand()` connect `Community 17` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 11`, `Community 13`, `Community 18`, `Community 19`, `Community 24`, `Community 28`, `Community 29`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `reviewCommand()` (e.g. with `traceDependencies()` and `printGhostBanner()`) actually correct?**
  _`reviewCommand()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Extract all export names from a TypeScript file.`, `Count non-empty lines in file.`, `inventory` to the rest of the system?**
  _198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05188118811881188 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06556948798328109 - nodes in this community are weakly interconnected._