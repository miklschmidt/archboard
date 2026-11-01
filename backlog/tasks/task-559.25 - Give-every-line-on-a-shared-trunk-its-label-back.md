---
id: TASK-559.25
title: Give every line on a shared trunk its label back
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T03:37:00Z'
updated_date: '2026-10-31T05:25:00Z'
labels:
  - renderer
  - board
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 997000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The door work made lines to one door share a trunk from three lines upward, and those lines draw no words. That departs from criterion 2 of TASK-559.14, and the owner noticed that a whole lot of labels are gone. 298 of 1,722 lines lost their label across 39 readings: 24 of 39 on Commands, 18 of 40 on Workhorses.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every line with a label shows it in the picture: BUS_LINES no longer removes words
- [x] #2 A line that joins a trunk wears its label on its own branch, near the part that owns it, before the join
- [x] #3 A reader can tell which words belong to which part on Commands and Workhorses
- [x] #4 Gates 1 to 4 are measured again, no drawing passes 500 ms, and any change is stated
- [ ] #5 The owner accepts it by eye
- [x] #6 Hovering any stretch of a shared trunk, including its last stretch before a door or part, lights every line that runs on that stretch, not only one of them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the words in the projection: remove BUS_LINES and busLines.
2. Route a door's trunk lines without their words, so the trunks of today stay, then give each line its words back in a second stage on the routed drawing (planned/words.rs).
3. In that stage, seat the words on the line's own branch nearest its part. A branch without room gets a new stem to the same trunk. Then the gaps its branch crosses grow, in two steps. Then the line takes a route of its own. A line that fails all of these draws no words, and is named.
4. Light every line under the pointer on a shared stretch: rest on the set of lines from elementsFromPoint, and light the union through the existing light set.
5. Measure Gates 1 to 4 against a clean build of the base commit, take real screenshots, and run the complete gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner found that hovering the end of a line with several earlier junctions lights only one of the connections.

Implemented. A door's trunk lines route without their words, so the trunks stay byte for byte, and planned/words.rs then gives each line its words on its own branch, beside its part. The grouping key matches the old rule: door, direction, kind and two-way. two-way now reaches the layout graph as archboard.relationship.two-way.

Measured on a clean build of the base commit 87c44ae02 against this branch, 115 readings of this repository and 4 of Shop:
Gate 1: 113 of 115 before, 106 of 115 after. Total area 135.9 M before, 149.6 M after. The words cost this: a plate on an upright branch needs its height in the gap between rows. New failures: Commands 0.50, Workhorses 0.49, Canonical architecture and Architecture runtime API 0.46, Retained reads 0.58, Canonical archive objects 0.57, Picture transitions 0.60 rounded. workbench and Workspace packages failed before.
Gate 2: passes. Worst name 12.19 px, worst path 9.58 px, 0 failing. Readings that land far: 5 before, 8 after.
Gate 3: passes. 115 and 4 readings, lost 0, uncounted 0, panel short 0, with rule6.ts adapted to the current projection fields.
Gate 4: passes. No Shop reading is larger than today.
Lines without words: 293 before, 6 after. Crossings 1848 to 2018, bends 3545 to 3674, long detours 30 to 53. Slowest drawing 478 ms before, 477 ms after, so no drawing passes 500 ms. Stage two adds at most about 40 ms.

The exceptions, each a line whose branch, stem, widened gap and own route all refuse, so it draws no words, and the panel of the selected line shows them:
Picture transitions: "the card opened, and the board above".
Retained reads: "from Picture cache, Local pictures".
Voice agent backend: "to Codex session, Codex process +1" and "with Browser gateway, Workhorse list".
Walkthrough recorder: "find ffmpeg and probe it, before any browser starts" and "open it with voice.wav".

Hover: a pointer on a line now rests on every line under it, through elementsFromPoint, and the light is the union through the existing light set. tests/system/browser/canonical-model-attention.test.ts proves it in a real browser on a stretch cut by a trunk mask, so masks do not block the hit test.

Evidence: /tmp/integrate/slice25/final-commands.png, final-workhorses.png, final-agent-cli.png, final-close.png.

Merged to integrate/pr19, gate 21 of 21 in 138 s after one load flake in canonical-preview-navigation, which then passed 3 of 3 alone. Six lines draw no words and are named above. Gate 1 fell from 113 to 106 of 115. Open: criterion 5, owner by eye.
<!-- SECTION:NOTES:END -->
