---
id: TASK-539.02
title: The Selection tab shows the exposed names of a picked container
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T19:19:00Z'
labels:
  - code-check
  - ui
dependencies:
  - TASK-539.01
parent_task_id: TASK-539
type: feature
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The person-facing half of TASK-539. A container whose binding names a module shows what its code exposes, most used first, so an interface that is too wide shows without opening the code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A picked container whose binding names a module shows an Exposed names region with the count of exposed names and of names used outside
- [ ] #2 Names are listed most used first, and names with no outside use collapse into one row that opens
- [ ] #3 Choosing a name lists its users as paths, and the files that pass it on as via lines
- [ ] #4 Pointing at a user lights the drawn part that holds it, and a user that no part of the board holds says Not drawn
- [ ] #5 The region shows when the pass ran, and says so when no pass has run, when the board changed after the pass, when the variant was not read, or when the container was skipped
- [ ] #6 A card, or a container whose binding names no module, shows no region
- [ ] #7 The picture does not change
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board: Board viewer@TASK-539.02, branched from TASK-538.01, adds List exposed names under Stage and reads (ExposedNames.tsx), rendered by Render stage states from DetailsPanel, calling Semantic queries (exposureQuery and the polled code findings) and Pane vault. The Semantic queries -> Board reads label names the exposure read.
2. clients: fetchExposure in reads/semantic-boards.ts reads GET /api/vault/code-findings/exposure (404 EXPOSURE_NOT_REMEMBERED is no reading); BoardReads gains exposure; queries.ts gains exposureQuery, keyed by the pass time so a new pass reads again, with no timer.
3. rules/semantic-board-canvas/code/exposed-names.ts: the state of the region from the remembered readings, the node and the reading on screen: no region (a card, an unbound node, or a container the matching pass did not judge and did not skip), no pass, variant not read, board changed after the pass, container skipped, or read with its counts. whenChecked moves to rules/semantic-board-canvas/code/when-checked.ts for both users.
4. components/semantic-board-canvas/ExposedNames.tsx in DetailsPanel after the interface: counts, names most used first, unused names folded into one row that opens, a chosen name lists its users as paths and its via files; pointing at a user lights the part that holds it, a user no part holds says Not drawn; the pass time or the reason there is no reading.
5. Tests: the rule by states; a rendered stage-harness test of the region (counts, order, fold, users, Not drawn, no region for a card).
6. Docs: the Selection tab section of operator-canvas-shell.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closing: archboard check --code --variant TASK-539.02 against the run without --variant shows no difference. Footprint read against base a463ff7e9 (the parent of 242261a9b) once TASK-538.01 was adopted. Named and changed: Render stage states, Semantic queries, Board reads, List exposed names, and Fetch semantic reads, whose responsibility now names a container's exposed names (it read as changed but not named first). Changed but not named by this task: Walkthrough replay (talk-reads.ts answers no exposure, inside only). Viewer entry point and Open or leave a board were changed by TASK-538.02 (e57e8945b). Named but not changed: Pane vault, named only by a relationship. Adopted on Board viewer at version 148.
<!-- SECTION:NOTES:END -->
