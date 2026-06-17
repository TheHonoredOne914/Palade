# Checklist

- [x] `OWL_ROWS` in `src/tui/components/Header.tsx` is `OWL_ART_DATA.slice(4, 16)` (12 rows, 6 paired terminal lines).
- [x] The `ASCII_ART` constant and the horizontal slice `slice(7, 27)` are unchanged.
- [x] `getOwlLines()` returns exactly 6 strings when the terminal is wide enough to show the owl.
- [x] No rendered owl line contains all‑black content (no extra empty row above or below the owl).
- [x] `debug-owl.cjs` is removed from the project root.
- [x] `npx tsc --noEmit` completes without type errors.
- [x] Visually: in a terminal ≥ 100 cols, the owl sits to the right of the `PALADE` ASCII art, top‑aligned with it, and matches the reference owl (head, two large eyes, yellow beak, body, two feet).
