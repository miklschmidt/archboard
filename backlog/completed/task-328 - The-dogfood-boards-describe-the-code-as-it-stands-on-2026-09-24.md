---
id: TASK-328
title: The dogfood boards describe the code as it stands on 2026-09-24
status: Done
assignee: []
created_date: '2026-09-24 09:23'
updated_date: '2026-09-24 09:42'
labels:
  - architecture
dependencies: []
priority: medium
type: docs
ordinal: 563000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracked .archboard/vault is the repository's own architecture, and .archboard/README.md tells every agent to start there. Its last full refresh was TASK-257 (1263b848, 2026-09-17); 180 commits under src have landed since and only six vault commits, so boards describe code that moved: the renderer layout story before ADR 0033, the Codex voice and workhorse work of TASK-291 to TASK-321 (workhorse news, tell_coordinator, recordings, auto-review), the Archboard server rename (TASK-323/324) and board and variant renames (TASK-281). ./bin/dogfood check only catches bindings to deleted files; a board can bind every node to a file that exists and still describe what those files no longer do. TASK-327 fixed five dead bindings and found the Semantic renderer board still describing reading choice, flank rules, a scorecard and ELK.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every board's current variant (or its draft, for a board nobody has built) describes what its bound code does now: parts, relationships, flows, views and walkthrough beats, each checked against source
- [x] #2 Subsystems or modules added since 2026-09-17 that a board's question needs are drawn on the board one level up, or on a new board it drills down to
- [x] #3 ./bin/dogfood check reports no diagnostics, and every drill-down opens a board the vault holds
- [x] #4 Every change went through the ./bin/dogfood CLI; historical variants are left as they were
- [x] #5 .archboard/README.md's board table names every board the vault holds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Six workers, one per area (328.01 to 328.06), each read its boards against source, edited only current variants under a claim through ./bin/dogfood, kept every subject id, and committed its own board files: 294a9093, 7bf4864a, 7008fe3c, e236b48c, 868ae2e1, 8f67c603. Parent verification: ./bin/dogfood check reports configurationValid true and 0 diagnostics; all 47 drill-downs on current and draft variants open one of the 15 boards; 33 of 34 views rasterize. The Voice coordinator view 'Workhorse news' fails in the renderer (relationship eRYh0zYO: 'Route run 6 reverses through a fixed bend', curves.ts), a renderer defect left unshaped. README: rasterizer and workhorse rows updated, and the maintenance paragraph now points at the task proposal rule in archboard-dev (14078af7). Open follow-ups reported to the user: variant summaries cannot be edited (several still say 2026-09-13), Command interface has 25 parts, and several routing defects (merged trunks, labels far from lines, a flow frame that ignores a last-column self-step label).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
All 15 dogfood boards were read against the code as it stands and corrected: false relationships removed or re-pointed, stale responsibilities rewritten, and what landed since 2026-09-17 drawn (workhorse news and tell_coordinator, walkthrough recording, board and variant rename, the shared Codex home, Graphviz and libavoid layout, the browser's agent setup and recording page). Verified with ./bin/dogfood check (0 diagnostics), a drill-down scan (47, none broken) and rasterizing every view (33 of 34; one renderer defect reported).
<!-- SECTION:FINAL_SUMMARY:END -->
