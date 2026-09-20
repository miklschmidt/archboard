---
id: TASK-287
title: Toggle comparison decoration and simplify the semantic sidebar
status: Done
assignee: []
created_date: '2026-09-20 00:34'
updated_date: '2026-09-20 00:58'
labels: []
dependencies: []
type: feature
ordinal: 501000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers need to inspect a proposal without its comparison marks and removed context, and the sidebar repeats containment that the diagram already shows. Keep the choice local to the pane and leave board content untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pane offers a comparison decoration control in the Comparison and attention legend.
- [x] #2 Switching the control shows or hides proposal comparison treatment on the canvas without changing the selected variant or writing the board.
- [x] #3 The Containment sections are absent from the board legend and selection inspector.
- [x] #4 The rendered sidebar and comparison control are covered by focused behavior checks.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a per-pane comparison display choice and pass it through both browser and server render paths with distinct picture cache keys. 2. Render clean variant content when comparison display is off; keep board comparison facts for inspection. 3. Remove both Containment sidebar sections and update focused UI tests. 4. Run focused checks and full gate, simplify, then commit only this task files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a pane-local comparison display choice. The clean render uses variant content while retaining comparison facts in the reply. Browser and server render paths, query keys, and persistent picture keys distinguish the two readings. Removed both Containment sidebar blocks. Focused renderer and UI tests verify motion in both directions; focused browser tests and bun run check passed. Updated the drill-boundary test fixture with the required order from the concurrent deterministic-renderer change. The existing Vite large-chunk warning remains.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a pane-local comparison canvas toggle with animated transitions and distinct picture caches, removed both Containment sidebar sections, and verified behavior with focused tests plus bun run check.
<!-- SECTION:FINAL_SUMMARY:END -->
