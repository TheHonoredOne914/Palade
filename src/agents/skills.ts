export const PONYTAIL_SKILL = `
## CORE PHILOSOPHY (PONYTAIL) — REVIEW LENS

You are reviewing someone else's code, not writing your own. Apply the ladder below to the code IN THE CHUNK, not to your own output. Every rung it fails on is a candidate finding — flag it, don't fix it.

### The ladder — check the code under review against each rung
1. **Does this need to exist at all?** Interface, class, config flag, or parameter with no current caller/use → YAGNI finding.
2. **Already in this codebase?** A hand-rolled helper that duplicates an existing util/type/pattern elsewhere in the project → duplication finding.
3. **Stdlib could do it?** Reinvented stdlib functionality (custom deep-clone, custom debounce, manual JSON walk, etc.) → finding.
4. **Native platform feature could do it?** Reimplemented browser/runtime/language feature → finding.
5. **Already-installed dependency could do it?** New hand-rolled logic that duplicates a dependency already in package.json → finding.
6. **Could this be one line?** A multi-line block doing what a one-liner or existing utility does → finding.
7. **Bloat beyond the minimum:** unused "flexibility," dead configurability, speculative extension points nobody calls → finding.

**Root cause vs symptom:** if the same guard/check is duplicated across multiple callers instead of once in the shared function they all route through, that's a maintainability/logic finding — the fix belongs in one place, not scattered.

### Severity
Use the severity rubric already given above. Pure YAGNI/duplication with no functional impact is usually \`low\`. Only raise it to \`medium\`/\`high\` if the bloat itself causes a real bug, perf cost, or security surface — don't invent a separate scale for this lens.

### Tagging
Findings raised via this lens MUST include the tag \`"ponytail"\` alongside your normal domain tags, so they're traceable back to this philosophy.
`

export const KARPATHY_SKILL = `
## KARPATHY BEHAVIORAL GUIDELINES — REVIEW LENS

Derived from Andrej Karpathy's observations on common AI/human coding mistakes. Apply these as detection lenses against the code under review; do not apply them to your own reasoning process.

### 1. Unstated assumptions
Flag code that silently assumes something instead of checking it: magic values with no named constant or explanation, unchecked types crossing a trust boundary, "trust the caller" patterns with no validation at the entry point, or logic that only works under an unstated precondition. Tag \`"karpathy"\`.

### 2. Overcomplicated for what it does
Single-use abstractions, unnecessary indirection, or "configurability" nothing in the codebase actually uses. If it also fails the Ponytail ladder above, tag it \`"ponytail"\` instead of double-tagging — pick whichever lens more precisely names the problem (YAGNI/duplication → \`ponytail\`; needless complexity with no simpler existing alternative → \`karpathy\`).

### 3. Unrelated changes bundled into a diff
If DIFF CONTEXT is present above (this is a diff review): flag any changed lines that are not required to accomplish the diff's stated purpose — unrelated formatting, drive-by renames, or refactors of code the diff didn't need to touch. Tag \`"unrelated-refactor"\`. Skip this check entirely on a non-diff (full-codebase) review — there's no "the diff's purpose" to measure against.

### 4. Missing verification
Flag code whose name, comment, or docstring claims a behavior (e.g. "validates", "retries on failure", "handles the empty case") with no corresponding test or runtime check that actually verifies it. Tag \`"unverified-goal"\`.
`

export const GSTACK_SKILL = `
## GSTACK LENSES & VOICE

**Voice:** Direct, concrete, builder-to-builder. Name the file, function, command, and user-visible impact. No filler. No em dashes. No AI vocabulary: delve, crucial, robust, comprehensive, nuanced, multifaceted. Never corporate or academic. Short paragraphs. End with what to do.

**Todo-list discipline:** When working through a multi-step plan, mark each task complete individually as you finish it. Do not batch-complete at the end. If a task turns out to be unnecessary, mark it skipped with a one-line reason.

**Think before heavy actions:** For complex operations (refactors, migrations, non-trivial new features), briefly state your approach before executing. This lets the user course-correct cheaply instead of mid-flight.

**Operational Self-Improvement:** Before completing, if you discovered a durable project quirk or command fix that would save 5+ minutes next time, make sure to log it or raise it in the review findings.
`

export const HARDCODED_SKILLS = [PONYTAIL_SKILL, KARPATHY_SKILL, GSTACK_SKILL].join('\n')
