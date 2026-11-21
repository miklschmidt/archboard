---
id: TASK-658
title: >-
  A reading with a few open frames packs tight instead of spreading across empty
  trays
status: Done
assignee:
  - '@claude'
created_date: '2026-11-21T04:41:00Z'
updated_date: '2026-11-21T06:27:00Z'
labels: []
dependencies: []
ordinal: 1141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Candidate J of the deepening run (sketch proposal MAUP1htL, "Each model resource's query lives with its behavior") draws at 2940 x 4533 px for 27 nodes and 34 connections. Most of that is empty tray: "Canonical model reader" holds a few cards spread over a tall frame, "Model access" is mostly blank around three cards, "Model reading" has a wide band with nothing in it, and lines run the full height of the picture and around the outside to reach cards that could sit next to their callers. A reviewer has to scroll and zoom to read eight changed parts. The picture is in the run report and its recipe is embedded in artifacts/archboard-deepen/compact-J-after.svg (state MAUP1htL, scope vKEsyHFk/yejBBUFY#TLCeNkdh, expand vKEsyHFk#51X5gvya, vKEsyHFk/yejBBUFY#n2ONtqdt, vKEsyHFk#y39xN3Ne, vKEsyHFk/yejBBUFY#AIp6YN1P, grammar architecture, theme auto, legend horizontal). Earlier compactness work: TASK-554, TASK-559.09 (both Done).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reading above draws with no tray holding a large empty band: each open frame is about as large as the cards and lines it holds need
- [x] #2 Lines between cards in the same frame or neighbouring frames take short paths instead of running around the picture, and no line crosses more cards or labels than before
- [x] #3 The picture area of this reading falls by at least a third, with every label readable and no overlaps, judged by looking at the before and after pictures
- [x] #4 The render corpus is compared before and after: every changed drawing is listed and looked at, none gets larger or loses readability, and the layout council or scorecard the archboard-renderer skill names does not get worse
- [x] #5 A focused test pins the compaction on a small graph with sparse open frames
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reading exactly and capture its layout graph.
2. Trace why its frames keep their empty bands: which layout engine draws it, and what refuses the tight drawing.
3. Fix the refused term in contraction, not with a guard or a second pass.
4. Add a focused contraction test that fails without the fix.
5. Compare the render corpus, the scorecard and a corpus of nested-frame readings before and after; look at the changed pictures.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: contraction (crates/archboard-layout/src/blocks/planned/compact/sheet.rs, apply_boxes/apply_lines) moved a card by its corner and kept its size, and moved each run of a line by the same whole shift, separately. The card's far wall (y + height) and the line end that stood on it then rounded apart: card bottom 1036.01, line start 1036.0099999999998. The guard in fixed.rs finish (channel.rs Probe::refusal, 'card') read the line as running into its own card and refused the contracted drawing at every clearance (8 to 32), so settled() kept the uncontracted legacy placement. The reading nests open frames, so it takes the legacy Blocks placement (dense::holders takes only flat frames); both of its candidates failed contraction this way.

Fix: a run that stood exactly on a wall of a card or a frame and moves with that wall lands exactly where the moved box puts the wall (Sheet::landed).

Reproduction: the shelved state now compares against Current (TASK-657) and draws 32 nodes; with the comparison against its predecessor LzXvT7U7 it draws the ticket's 27 nodes, 34 connections at exactly 2940 x 4533. After: 2845 x 2430 (48% less area), legend and labels readable in both themes, no overlaps. The 32-node reading of today keeps 3136 x 2535: its winning drawing already contracted.

Corpus: scripts/render-corpus.ts, 0 of 1116 drawings differ. measure.ts scorecard (ALL=1): every fixture and reading unchanged. A corpus of nested-frame readings (each module with its children that hold parts open, and with grandchildren too, plus each root opened with its children; 60 drawings): 38 changed, 37 smaller (to between 0.43 and 0.94 of their area), none larger, one byte change of 0.01 px in a mask. Card overlaps 0 before and after. Scorecard over the 38: fit, megapixels, card share, route length better in 37; crossings, bends, flank fan, routes through cards, labels off runs unchanged; lane ink better 28; shared corridor better 36 worse 1; label reach better 31 worse 6; label strand better 7 worse 30 and shared ink better 11 worse 26 (both are shares that rise as runs pack closer; their absolute measures, label reach and longest shared corridor, improved). Three nested readings of the whole Agent root refuse with 'No clear planned channel' before and after (TASK-624).

Site: bun run render repaints identical drawings apart from the flow ids each example import mints; the shell is untouched.

Lanes: build, types, lint:all (with clippy on wasm32), format:check, format:core, test:modules (5396 pass), test:system (228 pass), test:serial-browser, cargo test --workspace (517 pass), native cargo clippy --all-targets -D warnings: all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Contraction now keeps a line's end exactly on the wall of the card or frame it ends on. Before, a rounding difference between a moved card's far wall and the moved line end made the final guard refuse every contracted drawing of some readings, so pictures with nested open frames kept their uncontracted empty trays. The reading of this ticket falls from 2940 x 4533 to 2845 x 2430. The standard corpus and scorecard are unchanged; 37 of 60 nested-frame readings shrink, none grow. A focused contraction test on a sparse frame with real card heights fails without the fix. Changed files: crates/archboard-layout/src/blocks/planned/compact/sheet.rs and its tests.rs.
<!-- SECTION:FINAL_SUMMARY:END -->
