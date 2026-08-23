---
id: TASK-105
title: >-
  Comments and prose speak in metaphor — hand, glass, debt, owed, window — where
  they should name the literal thing
status: To Do
assignee: []
created_date: '2026-08-23 15:01'
labels:
  - ready-for-agent
dependencies:
  - TASK-101
references:
  - frontend/src/canvas
  - scripts/check-live-session.mjs
priority: medium
type: chore
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Across `frontend/`, `src/` and `scripts/`, comments and check prose describe the code in a metaphorical register: "a hand moved" for a user edit, "on the glass" for in the scene, "the debt"/"owed" for pending (unreported) edits, "the window" for the time a server update is being applied, and "delivery" for a server update. Counts at commit 2a4d9cc (word matches, some are ordinary English such as "hands the board back"): hand 155, glass 28, debt 7, owed 20, window 121. Mikkel's rule, 2026-08-23: name the literal thing; the touch display is an optional affordance, not a design principle, and must not shape names unless the code is literally about touch (then "touch point"). TASK-101 translates the files it touches; this task sweeps the rest. Mechanical, but each sentence must keep its meaning — read the code under a comment before rewording it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No comment or check message in `frontend/`, `src/` or `scripts/` uses "hand" for a user edit, "glass" for the scene, "debt"/"owed" for pending edits, or "delivery" for a server update; ordinary English uses ("hands the board back", "on the other hand") are left alone
- [ ] #2 "window" is kept only where it means a time window or a browser window, and reads "while a server update is being applied" where it meant the suppression count
- [ ] #3 Every rewritten sentence still says what the code under it does; `bun run test` passes
<!-- AC:END -->
