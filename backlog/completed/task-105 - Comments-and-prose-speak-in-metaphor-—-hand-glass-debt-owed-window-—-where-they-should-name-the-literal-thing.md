---
id: TASK-105
title: >-
  Comments and prose speak in metaphor — hand, glass, debt, owed, window — where
  they should name the literal thing
status: Done
assignee:
  - '@claude'
created_date: '2026-08-23 15:01'
updated_date: '2026-08-23 17:38'
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
- [x] #1 No comment or check message in `frontend/`, `src/` or `scripts/` uses "hand" for a user edit, "glass" for the scene, "debt"/"owed" for pending edits, or "delivery" for a server update; ordinary English uses ("hands the board back", "on the other hand") are left alone
- [x] #2 "window" is kept only where it means a time window or a browser window, and reads "while a server update is being applied" where it meant the suppression count
- [x] #3 Every rewritten sentence still says what the code under it does; `bun run test` passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read each grep hit in its surrounding code, classify literal or ordinary-English uses, and identify any nearby metaphor that also needs a concrete name.
2. Rewrite frontend comments file by file, run bun run build, commit the frontend slice, and append evidence to TASK-105.
3. Rewrite source comments and CLI prose file by file without changing interfaces or behavior, review src/server.ts separately, commit source slices by requested area where there are actual changes, and append evidence.
4. Rewrite scripts comments and check prose without changing assertions, commit the scripts slice, and append evidence.
5. Re-run the exact grep, list every remaining ordinary-English or literal hit, run bun run test, then follow the task-finalization guide and close TASK-105 with acceptance evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frontend: rewrote 19 comment sentences across CanvasPane, change reporting, element preparation, Shell, and touch-target CSS. Named user edits, scene state, pending edits, and server updates directly; also replaced pointer and tap assumptions where the code is input-device agnostic. bun run build passed. Commit f9c0fdb.

Source core and CLI: rewrote 124 prose sentences across 29 files. Literal names now cover user edits, scene or view state, server updates, selection, claim reasons, lock ownership, and explicit values. Nearby metaphors also translated: campaign to overall claim reason; gesture, finger, and tap to user edit or selection; wall to pane, board, or browser layout; handover to return, pass, or lock ownership. Literal time windows and the public Virgil hand font alias remain. bun run type-check passed. Commit 4ff298b.

Server: rewrote 21 prose sentences in src/server.ts. Lock and report comments now name pointer or user edits, claim reason and current step, pane or board state, and pending user edits. The two remaining window hits are literal export-response collection intervals. bun run type-check passed. Commit 687058e.

Scripts: rewrote 72 comment and check-prose sentences across 10 files. Delivery is now server update; hand and gesture are user edit or selection; echo is applying a server update; due is a report whose debounce expired; debt is missing parity. Renamed local fixture ids only where the metaphor would remain, without changing asserted behavior. Focused geometry, labels, one-write, and lock checks passed. Commit daae39f.

Scripts follow-up: translated 10 additional sentences in scripts/check-doing.mjs after the full suite exposed a check coupled to the old campaign wording. The assertion still proves that a claim overall reason does not satisfy the per-write description requirement. bun run test:doing passed 42 checks. Commit: f88a84d.

Final verification: the exact worklist grep returns 92 reviewed literal or ordinary-English hits: 60 browser window references, 25 genuine time or race windows, four public Virgil hand font aliases, two ordinary hand idioms, and one owed entitlement in the claim explanation. It returns no glass, debt, delivery, or rebase hits. bun run test passed the complete 26-suite chain, including all three sequential headless browser checks and the 42-cycle live session. Total rewritten prose: frontend 19 sentences; source core and CLI 124; server 21; scripts 82.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced metaphorical comment and check prose with literal domain terms across frontend, source, server, and scripts without changing behavior or interface identifiers. Reviewed every final grep hit as a browser or time window, public font alias, ordinary idiom, or entitlement. Verified the frontend build, focused checks, type-checks, and the complete bun run test chain.
<!-- SECTION:FINAL_SUMMARY:END -->
