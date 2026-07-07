# Palade Agent Quality Diagnostic — Baseline Run

- **Date:** 2026-07-07
- **Target file:** `src/orchestrator/pipeline.ts` (274 lines)
- **Protocol:** Single-file diagnostic. Six specialist agents run independently on the file with no repo access, no coordination. Findings are then adjudicated against the full repository (ground truth) to compute a false-positive baseline.

---

## Agent 1: Security

```json
{
  "agent": "Security",
  "findings": [
    {
      "line_range": "205-226",
      "severity": "info",
      "title": "specPath/constitutionPath are joined into projectRoot without traversal validation",
      "description": "swarmOptions.specPath and constitutionPath are joined with projectRoot and read with readFileSync; a value like '../../secrets.env' reads a file outside the project and injects it into every agent's LLM context.",
      "evidence": "const absoluteSpecPath = join(opts.projectRoot, specPath); context.spec = readFileSync(absoluteSpecPath, 'utf-8')",
      "confidence": "low",
      "confidence_reason": "Pattern-matching on 'unvalidated path join'. This is a local CLI where the operator controls their own flags and config — there is no attacker in the trust model who supplies specPath but doesn't already have shell access.",
      "proof_of_existence": "Mechanically yes: pass --spec ../../x and the file is read. But I cannot construct a scenario where that crosses a privilege boundary.",
      "counter_evidence": "The person who sets specPath is the person running the tool with full filesystem access already. Reading a file the user asked for is not an exploit."
    }
  ]
}
```

## Agent 2: Architecture

```json
{
  "agent": "Architecture",
  "findings": [
    {
      "line_range": "137-170",
      "severity": "medium",
      "title": "mergeContexts hardcodes the header format contract of two other modules",
      "description": "mergeContexts parses context blocks by matching lines that start with '// --- '. That format is produced elsewhere (buildRetrievedContext in ingestion/contextPacks, getKeywordContext in ingestion/keywordIndex). If either producer's format drifts, or the two producers format the same chunk's header differently, dedup silently fails or all context is dropped (blocks.length === 0 returns '').",
      "evidence": "if (lines[i].startsWith('// --- ')) { const key = lines[i]; ... } ... if (blocks.length === 0) return ''",
      "confidence": "medium",
      "confidence_reason": "The coupling is visible in this file (pipeline.mergeContexts ↔ contextPacks/keywordIndex output format), and the silent-drop path is real code. But whether the two producers actually emit different header strings for the same chunk requires reading files I cannot see.",
      "proof_of_existence": "If buildRetrievedContext and getKeywordContext label the same chunk with different header text, the dedup key (the raw header line) never matches and the chunk's content is injected twice. If either returns content without '// --- ' headers, that content is silently discarded.",
      "counter_evidence": "Both producers may share a formatting helper, making the formats identical by construction. The '' return may be intentional for header-less input."
    },
    {
      "line_range": "264-271",
      "severity": "high",
      "title": "@palade line-ignores are applied AFTER the swarm has already aggregated findings",
      "description": "applyLineIgnores filters result.findings only after runSwarm returns. If runSwarm internally computes derived outputs from the unfiltered findings (synthesis summary, cross-agent correlations, score inputs), findings on @palade-ignored lines have already leaked into those aggregates and cannot be removed by this line.",
      "evidence": "const result = await runSwarm(...); result.findings = applyLineIgnores(result.findings, annotationSummary.ignoredLines)",
      "confidence": "medium",
      "confidence_reason": "The ordering is definitively visible here: filtering is the last step, applied only to result.findings and not to result.crossAgentFindings or result.synthesis. Whether those aggregates are actually derived from findings is an assumption about runSwarm internals I cannot verify from this file.",
      "proof_of_existence": "A finding on a line marked '@palade ignore' is removed from result.findings but, if synthesis was computed inside runSwarm from the pre-filter list, the executive summary still discusses the ignored finding.",
      "counter_evidence": "runSwarm might apply annotation filtering itself before synthesis (the context object carries annotations), making this line a redundant safety net."
    },
    {
      "line_range": "261",
      "severity": "low",
      "title": "Successful dry-run exits via thrown exception",
      "description": "throw new CliExitError(0) uses exception control flow for a non-error outcome, coupling the pipeline layer to the CLI's error-handling convention.",
      "evidence": "throw new CliExitError(0)",
      "confidence": "low",
      "confidence_reason": "This is a style opinion. The pattern works, is explicit, and CliExitError is clearly designed for exactly this. I'm pattern-matching on 'exceptions for control flow'.",
      "proof_of_existence": "I can't construct a failure. Any caller that catches CliExitError generically will handle code 0 correctly if written to.",
      "counter_evidence": "This is a common, deliberate CLI idiom; the imported error type exists specifically to carry exit codes."
    }
  ]
}
```

## Agent 3: Performance

```json
{
  "agent": "Performance",
  "findings": [
    {
      "line_range": "52-66",
      "severity": "low",
      "title": "Sequential await of parseFile inside a loop",
      "description": "In the symbol-scoped branch, parseFile (disk I/O + annotation parsing) is awaited one file at a time. For N distinct files this serializes N I/O round-trips that are independent and could run under Promise.all.",
      "evidence": "for (const chunk of chunks) { ... const annotations = await parseFile(absolutePath) ... }",
      "confidence": "medium",
      "confidence_reason": "The serialization is mechanically certain from the code. The impact estimate is where honesty is required: symbol-scoped runs (:: syntax) touch a handful of files, so this costs milliseconds, not seconds. Real but ~N× on a small N.",
      "proof_of_existence": "Symbol-scope 50 files: 50 sequential file reads instead of one parallel batch. Measurable, small.",
      "counter_evidence": "Symbol scoping is explicitly the small-input fast path; the full-walk branch doesn't use this loop at all."
    },
    {
      "line_range": "171-173",
      "severity": "low",
      "title": "Per-chunk retrieved-context build over the full chunk corpus may be quadratic",
      "description": "buildRetrievedContext(chunk, chunks) is called once per active chunk and receives the entire chunk array; if it scans all chunks per call, context injection is O(active × total).",
      "evidence": "activeChunks.map((chunk) => mergeContexts(buildRetrievedContext(chunk, chunks), ...))",
      "confidence": "low",
      "confidence_reason": "Pure speculation about a function I cannot see. buildRetrievedContext may use an index internally. I am pattern-matching on 'function receives whole array inside a map'.",
      "proof_of_existence": "Cannot prove from this file. If it is a linear scan, 2000 chunks → 4M chunk comparisons — noticeable but still likely dwarfed by LLM latency.",
      "counter_evidence": "The keyword index built on line 130 exists precisely to avoid re-scanning; contextPacks may use a similar precomputed structure."
    }
  ]
}
```

## Agent 4: Maintainability

```json
{
  "agent": "Maintainability",
  "findings": [
    {
      "line_range": "136-149",
      "severity": "medium",
      "title": "Comment claims dedup 'by chunk id' but the code dedups by raw header line",
      "description": "The comment says 'dedup by chunk id to avoid duplicates', but the actual dedup key is the full '// --- ...' header line (const key = lines[i]). Two context sources describing the same chunk with differently formatted headers will not dedup. The comment documents behavior the code does not have.",
      "evidence": "// Merge context from both sources, dedup by chunk id to avoid duplicates. ... const key = lines[i]",
      "confidence": "high",
      "confidence_reason": "Both the comment and the contradicting implementation are fully visible in this file. No assumptions needed about external code to establish the mismatch itself.",
      "proof_of_existence": "Retrieved source emits '// --- foo.ts (score 3, lines 1-20) ---' and keyword source emits '// --- foo.ts (myFn) ---' for the same chunk: keys differ, both blocks are kept, the chunk content is duplicated in the prompt.",
      "counter_evidence": "If both producers happen to emit byte-identical headers for the same chunk, dedup works and only the comment is wrong."
    },
    {
      "line_range": "204-226",
      "severity": "low",
      "title": "Spec and constitution loading are copy-pasted blocks",
      "description": "Lines 205-214 and 217-226 are structurally identical (resolve default path, existsSync, try/readFileSync/log, catch/warn) differing only in path default, context field, and label. A loadOptionalDoc(path, label) helper would remove the duplication.",
      "evidence": "if (existsSync(absoluteSpecPath)) { try { context.spec = readFileSync(...) } catch {...} } // vs identical constitution block",
      "confidence": "high",
      "confidence_reason": "Both blocks are in this file; the duplication is line-for-line demonstrable.",
      "proof_of_existence": "Not a runtime bug — the risk is divergence: a future fix (e.g., encoding, size limit) applied to one block and not the other.",
      "counter_evidence": "Two instances is below many teams' rule-of-three threshold for extracting a helper."
    },
    {
      "line_range": "67-69",
      "severity": "info",
      "title": "Symbol-scoped log prints the same array's length twice as if a transformation occurred",
      "description": "chunks is assigned directly from scope.symbolChunks (line 46), so the log 'N symbol(s) → M chunk(s)' always prints N === M, implying a symbol→chunk expansion that never happens.",
      "evidence": "chunks = scope.symbolChunks ... `${scope.symbolChunks.length} symbol(s) → ${chunks.length} chunk(s)`",
      "confidence": "high",
      "confidence_reason": "Both operands are provably the same array within this file.",
      "proof_of_existence": "Any symbol-scoped run: the message reads '3 symbol(s) → 3 chunk(s)' unconditionally.",
      "counter_evidence": "Harmless today; the wording only becomes wrong if symbols ever map 1:many to chunks — at which point the code would need changing anyway."
    }
  ]
}
```

## Agent 5: Dead Code

```json
{
  "agent": "DeadCode",
  "findings": [
    {
      "line_range": "31",
      "severity": "low",
      "title": "PipelineOptions.allTargets is declared but never read by runPipeline",
      "description": "The allTargets?: ResolvedTarget[] field exists on the options interface, but runPipeline — the only function in this file, and the natural sole consumer of PipelineOptions — never references opts.allTargets. Callers can set it; it has no effect.",
      "evidence": "allTargets?: ResolvedTarget[]  // declared line 31; 'opts.allTargets' appears nowhere in the function body",
      "confidence": "medium",
      "confidence_reason": "Within this file the field is provably inert: the consumer never reads it, so whatever callers pass is ignored. I rate medium rather than high only because I cannot see whether some other module imports PipelineOptions and reads the field off an options object independently, or whether this is a staged API for imminent work.",
      "proof_of_existence": "Construct PipelineOptions with allTargets set to 10 targets: runPipeline behaves byte-identically to allTargets: undefined.",
      "counter_evidence": "Could be intentional forward-compatibility for a multi-target review feature; removing it would then churn the API twice."
    }
  ]
}
```

## Agent 6: Test Intelligence

```json
{
  "agent": "TestIntelligence",
  "findings": [
    {
      "line_range": "137-170",
      "severity": "medium",
      "title": "mergeContexts is a nontrivial hand-rolled parser that is structurally untestable and its edge cases are unverified",
      "description": "mergeContexts is a 34-line stateful line parser (header detection, block accumulation, duplicate skipping) declared inline inside runPipeline and not exported — it cannot be unit tested without running the whole pipeline. Edge cases that need coverage: (1) a source with no '// --- ' headers at all (entire content silently dropped, returns ''); (2) the same header key in both sources (dedup path); (3) content lines before the first header (silently skipped); (4) one source empty (early-return paths).",
      "evidence": "function mergeContexts(retrieved: string, keyword: string): string { ... } // declared inside runPipeline, no export",
      "confidence": "medium",
      "confidence_reason": "That it is untestable-as-written is certain from this file (inline, unexported). That it is untested is an inference — I cannot see the test directory, though testing it would require refactoring first, which is strong indirect evidence.",
      "proof_of_existence": "Scenario needing a test: keyword context returns a bare string with no header lines → mergeContexts returns '' and the chunk silently loses ALL injected context. No test can currently catch that regression.",
      "counter_evidence": "An integration test on runPipeline could exercise it indirectly; teams sometimes accept that for glue code."
    },
    {
      "line_range": "271",
      "severity": "low",
      "title": "The findings/line-ignore interaction is a critical path with no visible seam for testing ordering",
      "description": "applyLineIgnores(result.findings, ...) after runSwarm is the single enforcement point for '@palade ignore'. The scenario a test must cover: a finding on an ignored line must be absent from the returned findings AND from any aggregate (summary, cross-agent) derived from them — the current call filters only result.findings.",
      "evidence": "result.findings = applyLineIgnores(result.findings, annotationSummary.ignoredLines)",
      "confidence": "low",
      "confidence_reason": "I cannot see the test suite, and whether the aggregates are affected depends on runSwarm internals. This is a test-gap hypothesis, not an observed gap.",
      "proof_of_existence": "If synthesis inside runSwarm consumes unfiltered findings, no test asserting 'ignored finding absent from synthesis' exists to catch it — but I cannot confirm either premise from this file.",
      "counter_evidence": "swarm-level tests may already cover annotation filtering end-to-end."
    }
  ]
}
```

---

## Meta-Analysis

```json
{
  "meta": {
    "total_findings": 12,
    "high_confidence_findings": 3,
    "medium_confidence_findings": 5,
    "low_confidence_findings": 4,
    "agent_agreement": [
      {
        "line_range": "137-170",
        "agents_that_flagged_it": ["Architecture", "Maintainability", "TestIntelligence"],
        "conflict": "Architecture calls it cross-module format coupling, Maintainability calls it a comment/implementation mismatch on the dedup key, TestIntelligence calls it an untestable inline parser. No contradiction — three lenses on one root cause: dedup keyed on raw header text produced by two independent formatters.",
        "likely_verdict": "All three are facets of one real defect. In the live swarm this would surface as three findings and should merge; the merger's (filePath, severity, description) key would NOT merge them since severities and descriptions differ."
      },
      {
        "line_range": "264-271",
        "agents_that_flagged_it": ["Architecture", "TestIntelligence"],
        "conflict": "Architecture asserts an ordering bug (ignores applied after aggregation); TestIntelligence asserts the same path is untested. Compatible.",
        "likely_verdict": "If the ordering bug is real, the test gap is what let it survive. Arbitration should treat the Architecture finding as primary."
      }
    ],
    "highest_confidence_finding": "Maintainability 136-149: the comment says 'dedup by chunk id' while the code dedups by the raw header line — both halves of the contradiction are visible in the file, no external assumptions required.",
    "lowest_confidence_finding": "Security 205-226: path traversal on specPath — mechanically true, but there is no privilege boundary crossed; it is the operator reading their own file. Pattern-matched, not exploitable.",
    "hallucination_risk": "Moderate-low on this file, with a clear shape: every finding that required zero external assumptions (3 high-confidence) points at real, verifiable code facts. Risk concentrates in the 4 low-confidence findings, which are pattern-matches (security theater, style opinion, speculative big-O). The agents' self-reported confidence tracked evidence quality well on this run — the useful signal is that 'low' really did mean 'guessing'."
  }
}
```

---

## Adjudication (ground truth — full repo access)

Manual review of `pipeline.ts` plus verification against `src/ingestion/contextPacks.ts`, `src/ingestion/keywordIndex.ts`, `src/orchestrator/swarm.ts`, `src/orchestrator/types.ts`, `src/ingestion/annotationParser.ts`, `src/ingestion/chunker.ts`, and the test directory.

| # | Finding | Agent(s) | Verdict | Evidence |
|---|---------|----------|---------|----------|
| 1 | specPath traversal | Security | **FP** | Operator-supplied config on operator's own machine; no privilege boundary. |
| 2 | mergeContexts format coupling / broken dedup | Architecture | **TP** | Verified: `contextPacks.ts:135` emits `// --- path (score X, lines A-B) ---`, `keywordIndex.ts:88` emits `// --- path (symbolName) ---`. Same chunk from both sources → different keys → **dedup never works across sources**, which is its entire purpose. |
| 3 | CliExitError(0) control flow | Architecture | **FP** | Deliberate, working CLI idiom; style opinion. |
| 4 | Line-ignores applied after aggregation | Architecture | **TP** | Verified: `swarm.ts:468` computes synthesis from `finalFindings` and `swarm.ts:292` computes crossAgentFindings — both **before** `pipeline.ts:271` filters. Ignored-line findings leak into the executive summary, cross-agent penalties, and (via `CrossAgentFinding`, which carries no line info, `types.ts:34-41`) can never be filtered afterward. |
| 5 | Sequential parseFile | Performance | **TP** (trivial) | Real serialization; negligible at realistic symbol-scope sizes. |
| 6 | O(n²) buildRetrievedContext | Performance | **FP** | Speculative; no demonstrated impact (agent said so itself). |
| 7 | Comment vs dedup key mismatch | Maintainability | **TP** | Same root cause as #2, confirmed. |
| 8 | Duplicated spec/constitution blocks | Maintainability | **TP** | Line-for-line duplication, verified in file. |
| 9 | Misleading symbol log | Maintainability | **TP** | Provably always prints equal numbers. |
| 10 | Dead allTargets option | DeadCode | **TP** | Verified: no caller in `src/` passes `allTargets` into `runPipeline`; `review.ts`'s `allTargets` is an unrelated boolean CLI flag. The field is inert. |
| 11 | mergeContexts untestable/untested | TestIntelligence | **TP** | Verified: no `pipeline.test.ts` exists in `src/orchestrator/` (tests cover triage, swarm, merger, scheduler, verdict, findingValidation only). |
| 12 | Ignore-interaction untested | TestIntelligence | **TP** | Same verification as #11; and the bug it would have caught (#4) is real. |

**Missed by all agents (false negative):**
- `pipeline.ts:52-66` — the symbol-scope manifest stub sets `linesOfCode` from the **first** chunk seen per file (later chunks are skipped by the `seenPaths` guard), so multi-chunk files under-report LOC to triage/cross-referencing. Minor, but real and in-file-detectable.

## Baseline Numbers

| Metric | Value |
|---|---|
| Total findings | 12 |
| True positives | 9 |
| False positives | 3 |
| Missed bugs | 1 |
| **False positive rate** | **3 / 12 = 25%** |
| FP rate, confidence ≥ medium | **0 / 8 = 0%** |
| FP rate, confidence = low | 3 / 4 = 75% |

## Calibration Takeaways

1. **Self-reported confidence was the signal.** Every FP self-identified as low confidence, and every medium/high-confidence finding survived adjudication. Gating output at confidence ≥ medium would have produced a 0% FP rate on this file at the cost of one trivial TP.
2. **Who hallucinates:** Security (non-exploitable pattern-match), Architecture (style opinion), Performance (speculative complexity). All three FPs are the classic archetypes: trust-model-blind security flags, taste-as-architecture, and unmeasured big-O guesses.
3. **What they miss:** single-file agents cap out at "medium" on the most valuable bugs (#2, #4) because confirmation lives in other files. Both real cross-file bugs were flagged, but only as hypotheses. Context injection that includes the *producer* side of a consumed format contract would convert those mediums to highs.
4. **Merger implication:** the three-agent agreement on lines 137-170 would NOT merge under the current `(filePath, severity, description)` dedup key — severities and descriptions differ across agents. Cross-agent correlation on overlapping line ranges is the right merge key for this cluster.

## Real bugs worth fixing (from adjudication)

1. **`pipeline.ts:146-149` + `contextPacks.ts:135` + `keywordIndex.ts:88`:** cross-source context dedup is keyed on raw header lines that the two producers format differently — dedup never fires across sources; chunks get injected twice. Fix: key on `chunk.filePath:startLine` parsed from the header, or better, have producers return structured blocks.
2. **`pipeline.ts:271` vs `swarm.ts:292,468`:** `@palade ignore` filtering runs after synthesis and cross-agent aggregation. Fix: pass `ignoredLines` into `runSwarm` and filter `mergedFindings` before `memory.crossReference()`/synthesis.
3. **`pipeline.ts:31`:** remove or wire the dead `allTargets` option.
4. **`pipeline.ts:62`:** symbol-scope manifest stub under-counts `linesOfCode` for multi-chunk files.
