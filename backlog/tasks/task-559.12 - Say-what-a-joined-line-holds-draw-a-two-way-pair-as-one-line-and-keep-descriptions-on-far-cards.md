---
id: TASK-559.12
title: >-
  Say what a joined line holds, draw a two-way pair as one line, and keep
  descriptions on far cards
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T19:51:00Z'
updated_date: '2026-10-30T21:13:00Z'
labels:
  - renderer
  - frontend
dependencies:
  - TASK-559.02
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 984000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner accepted the four pictures of TASK-559.02 with named flaws. ADR 0052 exists because "32 relationships" told a reader nothing, so a joined line can only lose its stacked labels if a combined label says what the relationships are. Reciprocal pairs draw two lines today: 102 pairs across the readings of this repository and Shop. A far card shows the code path in place of the responsibility inside a box sized for the near view, so the description goes missing and an empty band stays. 607 joined lines exist across those readings, the median holds three distinct labels, and each label is about 32 characters, so listing labels cannot fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A joined line carries one short combined label that a reader can act on, derived deterministically from the model with no new authored data, and a line of many relationships never shows a bare count
- [ ] #2 A pair of parts with relationships in both directions draws one line with an arrow at each end, in the reader, the CLI and exports, and its tip and panel list both directions
- [ ] #3 A far card with a responsibility shows it beside its path where the box has room, and no card in the four corpus pictures shows an empty band
- [ ] #4 The cause of each oddly sized card in the four corpus pictures is named, and each defect is fixed
- [ ] #5 Gates 1, 2, 3 and 4 of the design record are measured again on the result, and any change to a gate result is stated
- [ ] #6 Rules 2, 4 and 8 of docs/design/reader-redesign.md and ADR 0052 say what the code does
- [ ] #7 The owner sees the root, Browser, Workspace packages and Command startup on the repaired model and accepts the combined label
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on branch feat/reader-line-words, commits 3f7f3630b, 92db27c56 and 41874e970. check:all exits 0 on the committed head. Measured on the repaired model of 115 readings: Gate 1 goes from 102 to 94 of 115 and total area from 160.4 M to 192.9 M. The combined words cause all of that loss; the two-way fold alone gives 104 of 115 at 155.0 M. Gates 2 and 3 hold. Gate 4 fails on Stock API at area ratio 1.098, caused by the card width rule. Numbers, options and pictures are in /tmp/integrate/slice-words/. The owner decides on the words and on Stock API. Acceptance criteria stay unchecked for the owner.
<!-- SECTION:NOTES:END -->
