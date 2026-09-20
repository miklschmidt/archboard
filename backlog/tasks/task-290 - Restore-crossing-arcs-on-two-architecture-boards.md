---
id: TASK-290
title: Restore crossing arcs on two architecture boards
status: Done
assignee: []
created_date: '2026-09-20 01:22'
updated_date: '2026-09-20 01:47'
labels: []
dependencies: []
references:
  - 'http://localhost:3100/?paneA=common-weblib+architecture@GwWurFMu'
  - 'http://localhost:3100/?paneA=cloud+infrastructure@Nc8vWLvX'
modified_files:
  - src/transformers/semantic-renderer/lib/layout/crossings.ts
  - src/runtime/semantic-renderer/tests/crossing-rounding.test.ts
type: bug
ordinal: 504000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current renders of Common-WebLib Architecture proposal GwWurFMu and Cloud Infrastructure proposal Nc8vWLvX show connector crossings without the expected bridge arc, making unrelated routes look joined. Previous crossing work (TASK-206, TASK-216) established arcs and narrow masks; diagnose the newly reachable geometry rather than changing board meaning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every proper reported crossing on both linked boards has a visible, correctly directed bridge arc and narrow separation.
- [x] #2 Non-crossings, shared endpoints, rounded corners, labels, traffic, selection and route identity remain intact.
- [x] #3 A focused regression catches the cause and the complete repository gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reduce each missing arc to fixed rounded-route geometry and a failing renderer test. 2. Adjust bridge eligibility/placement for the two observed corner-adjacent contacts without moving endpoints or labels or weakening shared-endpoint exclusions. 3. Re-render both saved boards and inspect the exact crossings, then run focused and full checks, simplify, and commit this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final verification: the restarted canvas rendered a rounded-corner-contact arc on LaTdOSNr at (1815, 558) in Common-WebLib and a turn-adjacent arc on FgEsApsS at (1407.13, 1110.5) in Cloud Infrastructure. Region PNGs visibly show the raised ink and narrow under-route gap. Fixed-route tests cover both cases, existing rounded-corner/shared-trunk tests remain green, and bun run check passed. Simplification uses one allowed-piece list for the lower connection and its adjacent bend segments.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bridge placement now tries either safe side and a small along-run adjustment near bends, and detects straight-to-rounded-corner crossings. Verified both live boards in SVG/PNG, focused regressions, and the complete repository gate.
<!-- SECTION:FINAL_SUMMARY:END -->
