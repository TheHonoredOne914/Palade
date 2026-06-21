# Fix Owl Header Spec

## Why
The PALADE TUI header currently renders the owl mascot one row taller than the
`PALADE` ASCII art. Because the owl grid starts with two empty padding rows,
`OWL_ROWS = OWL_ART_DATA.slice(2, 16)` produces 14 source rows which the half‑
block renderer pairs into 7 terminal lines, while the ASCII art is only 6
lines. The extra line and the trailing empty strip of black pixels below the
owl’s body make the rendered owl look stretched/“broken” (first screenshot)
instead of the clean compact owl shown in the reference image (second
screenshot). We need to crop the data so the rendered owl fits the ASCII art
height and looks like the reference owl.

## What Changes
- Update the `OWL_ROWS` slice in [Header.tsx](file:///c:/Users/HP/Desktop/palade/src/tui/components/Header.tsx)
  to start at the first row of the owl’s body and span exactly 12 source rows,
  so the half‑block pairing produces 6 terminal lines (same as the ASCII art).
- The first visible pixel of the owl lives in row 4 of `OWL_ART_DATA`
  (col 9, the right ear tuft; col 25, the left ear tuft). Rows 0–3 are pure
  black padding, so they are removed.
- The 6 lines are paired as: `(4,5) (6,7) (8,9) (10,11) (12,13) (14,15)`.
- The horizontal window (`slice(7, 27)`) and the `lastVisible` right‑trim
  already cover the owl’s bounding box, so no horizontal change is required.
- No changes to the ghost‑owl variant, ASCII art, or provider dots.

## Impact
- Affected specs: TUI header layout.
- Affected code: `src/tui/components/Header.tsx` only.
  (`OWL_ART_DATA` itself is untouched — the rendered selection is what
  changes, matching what the trimmed helper file `owl-art-trimmed.ts`
  appears to have been an attempt at.)

## ADDED Requirements

### Requirement: Owl Renders At Or Below ASCII Art Height
The system SHALL render the owl mascot in the TUI header at the same height
as the `PALADE` ASCII art block (6 terminal lines) or shorter, and SHALL NOT
exceed the ASCII art height.

#### Scenario: Wide terminal (>=100 cols)
- **WHEN** the user launches the TUI in a terminal that is at least 100 columns
  wide
- **THEN** the header shows the `PALADE` ASCII art on the left and the owl
  on the right, with the owl occupying exactly 6 terminal lines (12 source
  rows paired via the upper‑half‑block character).
- **AND** the owl’s visible content (head, eyes, beak, body, feet) matches
  the reference owl image, with no extra empty row of black pixels above or
  below the owl’s body.

#### Scenario: Narrow terminal (<100 cols)
- **WHEN** the user launches the TUI in a terminal narrower than 100 columns
- **THEN** the owl is hidden and only the ASCII art is shown, as today.

## MODIFIED Requirements

### Requirement: Header Owl Sourcing
The Header component SHALL source its owl data from
`OWL_ART_DATA.slice(4, 16)` (12 rows) instead of
`OWL_ART_DATA.slice(2, 16)` (14 rows), so that the half‑block pairing in
`getOwlLines()` yields exactly 6 lines and the rendered owl’s top edge aligns
with the first line of the `PALADE` ASCII art.
