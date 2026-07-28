// 'fixed-bug': was a genuine real-bug entry, confirmed fixed by a prior audit
// round. Kept in the catalog (rather than deleted) so its location still acts
// as a false-positive trap — an agent that still flags the old symptom is
// wrong, since the code no longer has the defect — but it no longer counts
// toward realBugCount/recall the way a live 'real-bug' does. See scorer.ts's
// scoreAgent()/matchDefect() for how this differs from 'false-positive'.
export type DefectCategory = 'real-bug' | 'false-positive' | 'fixed-bug'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface Defect {
  id: string
  file: string
  lineStart: number
  lineEnd: number
  severity: Severity
  category: DefectCategory
  hypothesis: string
  reality: string
  fromReport: boolean
}

export const SCHEDULER_FILE = 'src/orchestrator/scheduler.ts'
export const FINDING_VALIDATION_FILE = 'src/orchestrator/findingValidation.ts'
export const MERGER_FILE = 'src/orchestrator/merger.ts'
export const TRIAGE_FILE = 'src/orchestrator/triage.ts'

export const SCHEDULER_DEFECTS: Defect[] = [
  {
    id: 'S1',
    file: SCHEDULER_FILE,
    lineStart: 91,
    lineEnd: 93,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis: 'Recursion depth cap can return an oversized chunk.',
    reality:
      "WAS CONFIRMED, NOW FIXED (orchestrator-002). splitToLimit used to return [chunk] verbatim once depth > 10; it now calls hardTruncateChunk to guarantee the emitted chunk is under hardChunkLimit (see scheduler.ts's splitToLimit depth-cap branch). No longer a live defect — kept as a false-positive trap.",
    fromReport: true,
  },
  {
    id: 'S2',
    file: SCHEDULER_FILE,
    lineStart: 50,
    lineEnd: 56,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis:
      'chunk.tokenCount includes chunk.contextPrefix, but splitChunk only divides chunk.content; contextPrefix is re-prepended to both halves and never split.',
    reality:
      'WAS CONFIRMED, NOW FIXED (orchestrator-001). splitChunk now drops contextPrefix entirely when prefixTokens alone would meet/exceed hardChunkLimit, instead of re-prepending an unsplittable prefix to both halves. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'S3',
    file: SCHEDULER_FILE,
    lineStart: 79,
    lineEnd: 81,
    severity: 'low',
    category: 'real-bug',
    hypothesis:
      'Overlap lines are counted in BOTH halves, so the summed tokenCount of children exceeds the parent; estimateTotalTokens grows after splitting.',
    reality:
      'CONFIRMED (runtime). Splitting inflates total token count because the overlap region is double-counted. Downstream this can push a batch over softTokenLimit (scheduleBatches line ~118) and skews budget math.',
    fromReport: false,
  },
  {
    id: 'S-ovdup',
    file: SCHEDULER_FILE,
    lineStart: 30,
    lineEnd: 33,
    severity: 'low',
    category: 'false-positive',
    hypothesis:
      'Overlap causes duplication of FINDINGS across chunks (right side starts before the split).',
    reality:
      'FALSE / by design. splitPoint = splitIdx - overlap, so the overlap region [splitIdx-overlap, splitIdx-1] is intentionally included in both halves for context. Line ranges are consistent (left.endLine = startLine+splitIdx-1, right.startLine = startLine+splitPoint). Not a defect.',
    fromReport: true,
  },
  {
    id: 'S-dead',
    file: SCHEDULER_FILE,
    lineStart: 39,
    lineEnd: 49,
    severity: 'low',
    category: 'false-positive',
    hypothesis: 'Character-split fallback is dead code / unreachable.',
    reality:
      'FALSE. For a single-line chunk, splitIdx=1, overlap=0, so rightContent=lines.slice(1)="" and the condition fires. Verified: a 6003-token minified line splits into two char-halves.',
    fromReport: true,
  },
  {
    id: 'S-charcorrupt',
    file: SCHEDULER_FILE,
    lineStart: 70,
    lineEnd: 76,
    severity: 'low',
    category: 'false-positive',
    hypothesis:
      'Character-split corrupts the right chunk line range (splitPoint is a char offset used as a line offset).',
    reality:
      'FALSE. The character-split branch uses {...chunk} and never sets startLine; both halves correctly keep the single-line range. The line-split branch (72) uses splitPoint which IS a line index. No corruption.',
    fromReport: true,
  },
]

export const FINDING_VALIDATION_DEFECTS: Defect[] = [
  {
    id: 'F1',
    file: FINDING_VALIDATION_FILE,
    lineStart: 5,
    lineEnd: 7,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis:
      'normalizePath does not lowercase, so Windows case differences between a finding path and a chunk path never match.',
    reality:
      'WAS CONFIRMED, NOW FIXED (orchestrator-004). A separate normalizePathKey() case-folds the lookup key (normalizePath(p).toLowerCase()), used for chunk-map lookups, while normalizePath() itself still preserves case for the displayed filePath. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'F2',
    file: FINDING_VALIDATION_FILE,
    lineStart: 9,
    lineEnd: 10,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis:
      'normalizePath does not resolve ".." segments or internal "./", so relative paths diverge from chunk paths.',
    reality:
      'WAS CONFIRMED, NOW FIXED. normalizePath now runs path.posix.normalize() on the backslash-normalized path and strips dangling leading "../"/"./" segments before comparison. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'F3',
    file: FINDING_VALIDATION_FILE,
    lineStart: 12,
    lineEnd: 13,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis:
      'A finding with lineStart === undefined is returned early WITHOUT a findingFingerprint.',
    reality:
      'WAS CONFIRMED, NOW FIXED. getMatchingChunkAndClamp() can still return the bare finding without a fingerprint for the undefined-lineStart case, but validateAndFingerprintFindings() now unconditionally sets findingFingerprint via fingerprintFor(normalized) at push time regardless of that path, so every emitted finding is fingerprinted. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'F4',
    file: FINDING_VALIDATION_FILE,
    lineStart: 14,
    lineEnd: 15,
    severity: 'low',
    category: 'fixed-bug',
    hypothesis:
      'A non-integer lineStart (e.g. 12.5 from a tool) is dropped entirely as if out of range.',
    reality:
      'WAS CONFIRMED, NOW FIXED (orchestrator-005). getMatchingChunkAndClamp() now rounds a non-integer lineStart/lineEnd via Math.round() instead of rejecting it, as long as the rounded value is still in range. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'F-coll',
    file: FINDING_VALIDATION_FILE,
    lineStart: 30,
    lineEnd: 43,
    severity: 'low',
    category: 'false-positive',
    hypothesis: 'Fingerprint collision: different line numbers yield identical fingerprints.',
    reality:
      'FALSE. lineBucket uses the exact lineStart and is folded into the SHA1 basis before truncation, so different lines -> different digest. Verified: line 10 vs 200 produce distinct fingerprints.',
    fromReport: true,
  },
  {
    id: 'F-drop',
    file: FINDING_VALIDATION_FILE,
    lineStart: 90,
    lineEnd: 95,
    severity: 'low',
    category: 'false-positive',
    hypothesis: 'Silent finding drops lose VALID bugs when line ranges are off by >1.',
    reality:
      'FALSE. Findings dropped here are genuinely outside every reviewed chunk (out-of-range or unknown file). Dropping is correct, not lossy. Verified: lineStart:350 on a 1-300 chunk is dropped as expected.',
    fromReport: true,
  },
]

export const MERGER_DEFECTS: Defect[] = [
  {
    id: 'M1',
    file: MERGER_FILE,
    lineStart: 23,
    lineEnd: 24,
    severity: 'medium',
    category: 'fixed-bug',
    hypothesis:
      'jaccardSimilarity returns 1 when BOTH titles consist only of non-alphanumeric characters (both word sets empty).',
    reality:
      'WAS CONFIRMED, NOW FIXED (scorer-101). jaccardSimilarity now explicitly returns 0 when either word set is empty, instead of falling through to the union/overlap math that used to yield 1 for two empty sets. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
  {
    id: 'M-cycle',
    file: MERGER_FILE,
    lineStart: 133,
    lineEnd: 137,
    severity: 'low',
    category: 'false-positive',
    hypothesis: 'union() can create a parent cycle causing find() to loop infinitely.',
    reality:
      'FALSE. union guards with `if (rx !== ry)`, so repeated/opposite unions are no-ops. No cycle, no infinite loop.',
    fromReport: true,
  },
  {
    id: 'M-thresh',
    file: MERGER_FILE,
    lineStart: 78,
    lineEnd: 93,
    severity: 'low',
    category: 'false-positive',
    hypothesis:
      'Same-line matching uses a loose threshold that bypasses the stricter cross-agent bar.',
    reality:
      'FALSE. The same-line branch (78-89) applies agent-specific thresholds (0.5 same / 0.7 cross) identical to isNearMatch (59-65). Thresholds are symmetric.',
    fromReport: true,
  },
]

export const TRIAGE_DEFECTS: Defect[] = [
  {
    id: 'T1',
    file: TRIAGE_FILE,
    lineStart: 93,
    lineEnd: 97,
    severity: 'low',
    category: 'fixed-bug',
    hypothesis:
      'Array extraction uses the FIRST "[" and LAST "]" in the LLM response, so any extra brackets elsewhere produce invalid JSON.',
    reality:
      'WAS CONFIRMED, NOW FIXED (orchestrator-010). Triage now uses extractBalancedJson(), a bracket-depth-aware, string-literal-honoring extractor, instead of a naive first-"["/last-"]" substring slice. No longer a live defect — kept as a false-positive trap.',
    fromReport: false,
  },
]

export const ALL_DEFECTS: Defect[] = [
  ...SCHEDULER_DEFECTS,
  ...FINDING_VALIDATION_DEFECTS,
  ...MERGER_DEFECTS,
  ...TRIAGE_DEFECTS,
]

export function realBugCount(defects: Defect[] = ALL_DEFECTS): number {
  return defects.filter((d) => d.category === 'real-bug').length
}
