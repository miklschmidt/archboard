---
id: TASK-084
title: >-
  A batched agent write mutates the board before it knows the whole write is
  valid
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 21:47'
updated_date: '2026-08-23 16:44'
labels:
  - backend
dependencies:
  - TASK-083
priority: medium
type: bug
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while landing TASK-083, measured against a throwaway canvas rather than read out of the source.

`applyAgentChanges` in src/server.ts walks its upserts mutating `board.elements` as it goes. An upsert whose id the board does not hold falls through to `buildCreatedElement`, which parses against `CreateElementSchema`; a payload carrying only metadata (no `type`, no `x`, no `y`) fails that parse and throws. The route catches it and answers 500 with nothing rolled back, so every upsert before the bad one is already on the board. Measured: two upserts, the first naming a real element and the second naming an id that is not there, returns 500 and leaves the first element's customData written.

This is not reachable through any caller's own mistake. Both promote surfaces and `apply` resolve every id against a read of the board before they write, so a caller-side bad id costs zero writes (check-one-write proves it for both). It needs the element to be deleted between that read and the write, which is a second writer. It is therefore the same hazard ADR 0016 is about, and it is common to every batched agent intent rather than special to any one of them.

The fix is contained: decide create-or-update for every upsert and parse the creates before touching the map, the way `apply` resolves its ids before writing. Deletes are already safe (a missing id is skipped, not thrown on).

Left out of TASK-083 deliberately: that task named three callers, and this is the route underneath all of them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A batched agent write that is refused leaves the board exactly as it was, whatever position in the upsert list the bad element is in
- [x] #2 check-one-write proves it by sending a change report whose second upsert is unbuildable and asserting the first one did not land
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Route the batched change through TASK-102's isolated board mutation so all upserts validate and apply before persistence or broadcast. 2. Extend check-one-write with a valid first upsert and unbuildable second upsert, then assert the first element is unchanged. 3. Run the focused gates and close the task with the regression evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented through TASK-102's board-write module. writeBoard copies the source content before invoking the complete mutation; applyElementInput may reject any upsert, but persistence, change-feed recording, pane broadcast and answer shaping happen only after the mutation returns. check-one-write sends a valid update followed by an unbuildable create and proves the valid update did not land.

Final validation: bun run type-check passed; test:one-write 69, changes all, boards all, doing 42, lock 115, version 61, module-scope 50 modules plus self-test.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Batched agent changes now run against an isolated request-local board copy inside TASK-102's write entry. Persistence, feed recording and pane broadcast start only after the whole mutation succeeds. check-one-write sends invalid creates in the first, middle and second/last positions, with valid updates around them, and proves every refusal leaves both existing elements unchanged; 69 checks pass.
<!-- SECTION:FINAL_SUMMARY:END -->
