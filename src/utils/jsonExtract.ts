/**
 * Scan `text` for the first balanced `open`...`close` region — honoring
 * string literals so a brace/bracket that appears inside a quoted string
 * doesn't throw off the depth count — and return its contents, or null if
 * none is found.
 *
 * Shared by verdict.ts (brace-scan for a JSON object preamble) and
 * triage.ts (bracket-scan for a ranked-paths JSON array) so both fall back
 * to the same robust extraction instead of triage.ts's previous naive
 * `indexOf('[')`/`lastIndexOf(']')` substring slice, which broke on any
 * stray bracket elsewhere in the model's response (orchestrator-010).
 */
export function extractBalancedJson(text: string, open: string, close: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === open) {
      if (depth === 0) start = i
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}
