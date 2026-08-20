---
id: TASK-052
title: 'The change feed baseline is a shallow copy, so a board can diff against itself'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 04:34'
updated_date: '2026-08-20 08:27'
labels: []
dependencies: []
references:
  - src/core/change-feed.ts
  - src/core/board-store.ts
  - scripts/check-changes.mjs
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-048 agent, which fixed the same hazard one layer in and named this one rather than widening its scope.

src/core/change-feed.ts around line 93: snapshot() takes its diff baseline with elements.map(el => ({ ...el })). The comment beside it says it copies for exactly this reason, so the intent is right and the copy is not deep enough. customData and boundElements are still shared with the live board.

customData is the semantic channel (ADR 0003) and boundElements is how a label belongs to its container, which makes them the two fields the change feed most needs a stable baseline for. One in-place edit to either and the baseline moves with the board, so the diff compares the board against itself and reports nothing changed.

Nothing fails today because updates replace objects rather than mutating them. That invariant is unwritten and now has three separate places relying on it, two of which have been fixed (TASK-042 for a branch, TASK-048 for a snapshot). This is the third and last one found.

The failure mode here is quieter than the other two. A branch or snapshot that shares objects produces visibly wrong data. A baseline that shares objects produces silence: the board changed, the feed says nothing, and nobody knows to look. That silence also reaches the agent, because the feed is what injection pushes into a live Codex thread.

copyElements in src/core/board-store.ts already exists and is the deep copy TASK-048 lifted out for reuse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The change feed baseline shares no element objects with the live board, nested fields included
- [ ] #2 A check mutates customData and boundElements in place on a live board and shows the feed still reporting the change
- [ ] #3 No remaining path copies elements shallowly where it needs a baseline
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The change feed's baseline now uses copyElements, the deep copy TASK-042 introduced and TASK-048 lifted out for reuse. This was the third and last instance of one hazard.

Sweep for remaining shallow copies (AC3): every other Array.from(board.elements.values()) in src/server.ts is either a response payload that gets serialised, a short-lived read for query or describe, or the read() callback handed to the change feed, which now deep-copies what it is given. The only three places that retained element references past a request were a branch, a snapshot and this baseline, and all three are fixed.

Verified by reverting copyElements to a shallow spread in dist and re-running: both new checks fail, the first with the exact predicted symptom, "the feed diffed the board against itself and found nothing", and the second showing the shared fields moving together (kind=queue bound=2). Restored, rebuilt, bun run test exits 0 across thirteen suites.

Two checks in scripts/check-changes.mjs. The first is behavioural: edit customData in place on a live board and assert the feed still reports it. The second measures copyElements directly, because pushing to boundElements is bookkeeping rather than a semantic change, so it produces no event either way and behaviour cannot tell a shared array from a copied one.

Implemented from the partial work of an agent that hit a session limit after making the code change and before writing the check.
<!-- SECTION:NOTES:END -->
