---
id: TASK-590.12
title: >-
  The sidebar lists modules, flows and walkthroughs as sections of one list,
  without tabs
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T15:08:00Z'
updated_date: '2026-11-07T16:34:00Z'
labels: []
dependencies:
  - TASK-590.10
  - TASK-590.11
parent_task_id: TASK-590
ordinal: 1055000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner said they hate the sidebar tabs, and that the 448 px column is far too wide while still too narrow for History and Measures. Modules, flows and walkthroughs belong in one list in separate sections, and the column goes back to a normal width. NAVIGATOR_WIDTH also sets the reference pane of the renderer (ADR 0043 and its amendment of 2026-10-31), so the width change reaches the core constants.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The left column has no tabs: modules, flows and walkthroughs are sections of one list
- [x] #2 While a proposal is read, its changes are reachable without a tab
- [x] #3 History and Measures open their dialogs from the column
- [x] #4 The column has a normal width, and NAVIGATOR_WIDTH, the core constants and ADR 0043 follow it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ModelColumn: replace the tab trough with one scrolling well of sections (Changes on a proposal, Modules, Flows, Walkthroughs). Each section has a sticky head that folds it and shows its count; the lists inside offset their stuck rows by the head.
2. Two quiet keys over the well open the History and the Measures dialogs. The History open state lives in useReader, because the state chip of the header opens it too; the Measures open state and sort move with Measures.
3. Delete the destination concept: no Destination type, no onDestination, no onList. Find and the right panel open a flow or walkthrough directly, and the flows and walkthroughs lists keep their lit row in view as the module tree does.
4. NAVIGATOR_WIDTH 448 -> 280 in shell-geometry.ts and design.rs; LANDING_ROOM and the layout constants follow. Check the agent dock at the foot. ADR 0043 gets an amendment of 2026-11-07.
5. Docs: DESIGN.md, docs/design/operator-canvas-shell.md, .impeccable/design.json, docs/agents/frontend.md.
6. Tests: browser owners that open tabs open sections and dialogs; run test:core, lint:all, tsc, the module tests and the touched browser files. Screenshots at 1920x1080 in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-11-07, at 1920x1080 on an own server:
- AC 1: reader-column.test.ts holds that the list has the sections modules and flows, and that a section head folds and unfolds its rows from the keyboard. The captures column-light.png and the new docs/design/assets/operator-shell-navigator.png show one list with sticky section heads and counts.
- AC 2: canonical-model-comparison.test.ts holds that Changes is the first section while a proposal is read, and walks every change with n. The captures proposal-light.png, proposal-dark.png and proposal-walk-dark.png show it. The module tree does not follow while a proposal is reviewed, so the change walk keeps its row in view (14 of 47 stayed in view).
- AC 3: the History key opens ModelHistoryDialog (TASK-590.10). The Measures key opens the placeholder ModelMeasuresDialog (capture measures-dialog.png, key pressed while open). TASK-590.11 replaces the placeholder.
- AC 4: NAVIGATOR_WIDTH is 280 in shell-geometry.ts and in crates/archboard-scene/src/paint/design.rs. ADR 0043 has an amendment of 2026-11-07: the reference pane is 1311 by about 936, and LANDING_ROOM is 1231 by 955. shell-layout.test.ts passes. The agent dock (sign-in, Talk) fits at the foot of the column in the captures. Voice with a signed-in agent was not checked, because no sign-in was available.
- The width changes the layout of documents. The landing test in reading.rs takes its unreadable width from LANDING_ROOM. The wrapped-blocker fixture fit the larger pane whole without its wrap, so the test adds one card over the first and asserts the wrap.
- Flows and Walkthroughs keep their lit row in view, as the tree does: the last of 72 flows chosen through Find scrolled into view.
- Empty Flows or Walkthroughs sections are left out. Find does not unfold a folded section.
- packages/renderer: wide-pictures.test.ts has 3 failures (Archboard root, Camera and pointer, Canonical architecture: crowded arcs). They fail the same way at 448 px, so this work does not cause them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The left column has no tabs. It is 280 px wide and holds the keys of History and Measures over one list in a well. The list holds Changes while a proposal is read, then Modules, Flows and Walkthroughs, each under a sticky head that shows its count and folds the section. The destination concept is gone: no Destination type, no onDestination and no onList. Find and the right panel open a flow or walkthrough directly, and each section keeps its lit row in view. NAVIGATOR_WIDTH is 280 in the shell and in the core, and ADR 0043 records the new reference pane and landing room.

Verification: tsc exit 0, lint:all exit 0, the unit tests 1029 pass, test:core exit 0, 23 browser files with 35 tests pass, and the list files pass again after the reveal (7 files, 9 tests). Captures in both themes were read.

Follow-ups: reader-measures.test.ts still reads [data-destination] and belongs to the Measures work (TASK-590.11). The ui-kit Tabs trough variant has no user left. The PaneChrome slot is still named destinations.

Commits: e14c9858e, bc582efbe, e9cee70b2, ab66c0760.
<!-- SECTION:FINAL_SUMMARY:END -->
