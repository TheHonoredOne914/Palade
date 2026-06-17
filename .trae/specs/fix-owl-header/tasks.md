# Tasks

- [x] Task 1: Crop owl source rows in Header to match ASCII art height
  - [x] SubTask 1.1: Open [Header.tsx](file:///c:/Users/HP/Desktop/palade/src/tui/components/Header.tsx) and locate the `OWL_ROWS` constant near the top of the file (currently `OWL_ART_DATA.slice(2, 16)`).
  - [x] SubTask 1.2: Change the slice to `OWL_ART_DATA.slice(4, 16)` so it returns exactly 12 rows (rows 4–15) — the rows that contain the owl’s head, body, and feet, with the first two black padding rows removed.
  - [x] SubTask 1.3: Verify that `getOwlLines()` (which pairs rows two at a time using the upper‑half‑block character) now produces 6 terminal lines, matching the 6 lines of the `ASCII_ART` constant.
  - [x] SubTask 1.4: Leave the column window `slice(7, 27)` and the `lastVisible` right‑trim logic unchanged — the existing horizontal range already covers the owl’s bounding box.

- [x] Task 2: Clean up the temporary debug script created during investigation
  - [x] SubTask 2.1: Delete `c:\Users\HP\Desktop\palade\debug-owl.cjs` (created only for diagnosing the slice).

- [x] Task 3: Validate the fix
  - [x] SubTask 3.1: Run `npx tsc --noEmit` from `c:\Users\HP\Desktop\palade` to ensure the Header change type‑checks.
  - [x] SubTask 3.2: Visually confirm by launching the TUI in a wide terminal (`npx palade` in a window ≥ 100 cols) that the owl renders at the same height as the `PALADE` text and matches the reference image.

# Task Dependencies
- Task 2 (cleanup) is independent of Tasks 1 and 3.
- Task 3 depends on Task 1.
