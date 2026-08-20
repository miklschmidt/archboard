---
id: TASK-048
title: A snapshot shares element objects with the board it was taken from
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 04:01'
updated_date: '2026-08-20 04:30'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-store.ts
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-042 agent, which fixed the same hazard one layer down and named this one rather than widening its scope.

POST /api/snapshots builds a Snapshot with elements: Array.from(board.elements.values()), so the snapshot holds the same objects as the live board. Editing the board in place would edit the snapshot taken to protect against exactly that.

Nothing fails today, for the same unwritten reason TASK-042 removed elsewhere: updates replace objects rather than mutating them, and restore goes back through batch-create and builds fresh objects. That invariant is not written down and not tested, and a snapshot is the one thing whose whole job is to be a copy.

TASK-042 put the deep copy in replaceBoardElements in src/core/board-store.ts and used structuredClone, because the parts worth protecting are nested: customData is the semantic channel (ADR 0003) and boundElements is how a label belongs to its container, so a shallow spread leaves exactly those shared. The same reasoning applies here, and the same helper may fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A snapshot shares no element objects with the board it was taken from, nested fields included
- [x] #2 A check mutates a board in place after snapshotting and shows the snapshot unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/board-store.ts: lift the deep copy out of replaceBoardElements into copyElements(elements), so the one place that explains why the copy has to be deep serves both callers. replaceBoardElements keeps its behaviour and calls it.
2. src/server.ts: POST /api/snapshots builds its Snapshot from copyElements(...) rather than Array.from(board.elements.values()). Restore already goes back through batch-create, so nothing else on that path shares objects.
3. src/types.ts: the Snapshot type says its elements are a copy, since that is now the point of the field.
4. scripts/check-boards.mjs: an in-process check, following TASK-042's, that takes a snapshot and then mutates a board element in place — position, customData and boundElements, so the nested fields are covered — and shows the snapshot unchanged. Object identity is not visible over HTTP, so this runs against the store and the route's own copy step rather than through fetch.
5. Report, do not fix: change-feed.ts's snapshot() is a shallow spread for the same stated reason, so a baseline still shares customData and boundElements with the live board.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The deep copy moved out of replaceBoardElements into copyElements(elements) in src/core/board-store.ts, so one place explains why the copy has to be deep and both callers use it. replaceBoardElements now fills the map from copyElements; POST /api/snapshots builds its Snapshot from copyElements(board.elements.values()) instead of Array.from.

Nothing else on the snapshot path shares objects. Restore goes back out through clear plus batch-create, which builds fresh objects, so a snapshot survives being restored more than once. GET /api/snapshots/:name serialises, so it cannot leak a reference either. The Snapshot type in src/types.ts now says this on the elements field, because a deep copy is what the field is for.

The check imports the express app rather than driving the spawned server, which is the only way object identity is visible: over HTTP everything is serialised and a shared reference looks exactly like a copy. The imported app shares the check process's board store, so the check can take a snapshot over HTTP through the real route and then reach into the store and mutate the element in place. It listens on an ephemeral port and closes again, so it never meets the server the rest of the file spawns.

Named, not fixed: change-feed.ts's snapshot() takes a baseline with a shallow spread, and says in a comment that it does so for this reason. customData and boundElements are still shared with the live board there, which is the TASK-042 hazard one layer further out.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A snapshot is built with copyElements now, so it shares no object with the board it was taken from, nested fields included. The deep copy TASK-042 put inside replaceBoardElements is lifted into copyElements in src/core/board-store.ts and used by both, since a branch and a snapshot are the same promise made twice.

AC1 and AC2 are proved by one check in scripts/check-boards.mjs, next to the branch check it mirrors. It imports the express app so the route runs against this process's board store, takes a snapshot over HTTP, and then mutates the board's element in place: x, customData.archboard.kind, boundElements and groupIds. The snapshot is unchanged, and its object and every nested one differ from the board's while serialising identically.

Reverting the route in dist/server.js to Array.from(board.elements.values()) fails 3 checks, and the failure prints the corrupted snapshot: x 999, kind datastore, an extra bound element, a second group. Replacing the deep copy with a shallow spread still fails 2 of them, the nested ones, which is the case the shallow version was chosen against. Restoring passes all of them, and bun run test exits 0 with 0 failures across 326 checks.

Named rather than fixed: change-feed.ts's snapshot() takes its baseline with a shallow spread and says in a comment that it does so to avoid this hazard, so a baseline still shares customData and boundElements with the live board.
<!-- SECTION:FINAL_SUMMARY:END -->
