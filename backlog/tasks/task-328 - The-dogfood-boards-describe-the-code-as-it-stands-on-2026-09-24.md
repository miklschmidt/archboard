---
id: TASK-328
title: The dogfood boards describe the code as it stands on 2026-09-24
status: To Do
assignee: []
created_date: '2026-09-24 09:23'
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
- [ ] #1 Every board's current variant (or its draft, for a board nobody has built) describes what its bound code does now: parts, relationships, flows, views and walkthrough beats, each checked against source
- [ ] #2 Subsystems or modules added since 2026-09-17 that a board's question needs are drawn on the board one level up, or on a new board it drills down to
- [ ] #3 ./bin/dogfood check reports no diagnostics, and every drill-down opens a board the vault holds
- [ ] #4 Every change went through the ./bin/dogfood CLI; historical variants are left as they were
- [ ] #5 .archboard/README.md's board table names every board the vault holds
<!-- AC:END -->
