---
id: TASK-042
title: save --as shares element objects between the source board and the branch
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:37'
updated_date: '2026-08-20 03:57'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/board-store.ts
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while implementing TASK-035, reported as a latent hazard rather than a live bug, and left unfixed on purpose.

POST /api/boards/save copies element references into the branched board, so the two boards hold the same objects. TASK-035's restamp replaces the objects for promoted elements, which makes nodes independent, but plain elements are still shared between source and branch.

No demonstrated failure today, because updates replace objects rather than mutating them in place. That is the only thing standing between this and a branch that silently edits its source, and it is an invariant nobody wrote down or tests.

Two boards that share memory is exactly the class of bug TASK-016 removed from the sync path, where one tab's scene could overwrite the board. The same reasoning applies: a branch exists so the source can stay put.

Worth fixing while the reason is fresh, not after somebody adds an in-place mutation and spends a day on why editing a proposal changed the architecture it was branched from.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A branched board shares no element objects with its source
- [x] #2 Mutating an element on a branch in place cannot affect the source, shown by a check that mutates in place
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Put the copy in src/core/board-store.ts as replaceBoardElements(board, elements), which clears a board's map and fills it with structuredClone of each element. Deep, not shallow: customData and boundElements are the fields a branch would share otherwise, and customData is the metadata channel (ADR 0003).

2. Call it from the one place that fills a branch, in POST /api/boards/save, replacing the clear-then-set loop. That is the only cross-board element copy in the process, confirmed by grepping every elements.set call.

3. Prove it with a check that mutates in place, which is what the unwritten invariant was holding back. In-process against the real store, alongside the other rules checked on their own at the top of scripts/check-boards.mjs: build a source board, branch it through replaceBoardElements, then set x, reach into customData.archboard and push onto boundElements on the branch, and assert the source is untouched.

4. Name, do not fix, the neighbouring case: POST /api/snapshots stores Array.from(board.elements.values()), so a snapshot shares objects with the board it was taken from.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The copy now lives in replaceBoardElements in src/core/board-store.ts, which clears a board's map and fills it with structuredClone of each element. POST /api/boards/save calls it for the branch case, replacing the clear-then-set loop that put the source's own objects into the branch's map. Grepped every elements.set call in the process: that was the only cross-board element copy.

Deep rather than a spread, because the shared parts worth protecting are nested. customData is the semantic channel (ADR 0003) and boundElements is how a label belongs to its container, so a shallow copy would have left exactly those shared. structuredClone rather than a JSON round trip because it keeps properties whose value is undefined.

Evidence for AC 1 and AC 2 is one in-process check in the rules section of scripts/check-boards.mjs, which is where object identity can be seen at all. It builds a source board, branches it through replaceBoardElements, and asserts the copy is a different object, that customData, customData.archboard, boundElements and groupIds are all different objects, and that the content is identical. Then it mutates the branch in place — sets x, reaches into customData.archboard.kind, pushes onto boundElements and groupIds — and asserts the source is untouched. Confirmed the check is real by reverting replaceBoardElements to store the element itself: three checks fail, and the failure output shows the source carrying x 999, kind datastore and both pushed entries.

End to end, the branch section now puts an unpromoted text element on the source before branching, because restampVariant returns those untouched and they were the objects the two boards shared. The branch comes back with four elements including that one, content intact.

Separate finding, named and not fixed: POST /api/snapshots builds a Snapshot with elements: Array.from(board.elements.values()), so a snapshot shares objects with the board it was taken from. Restore goes back through batch-create and builds fresh objects, so nothing fails today for the same reason nothing failed here.

Validation: bun run test, 169 checks, 0 failures, exit 0. bun run type-check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A branched board now holds its own element objects. POST /api/boards/save used to copy the source's element references into the branch, so two boards held one set of objects behind two names; the restamp in TASK-035 replaced the promoted ones, and the plain ones stayed shared. The copy moved into replaceBoardElements in src/core/board-store.ts and is deep, because the fields worth protecting are the nested ones: customData is the semantic channel and boundElements is how a label belongs to its container. Verified by a check that mutates a branched element in place — position, customData.archboard.kind, boundElements, groupIds — and asserts the source is untouched; confirmed the check is real by reverting the fix and watching it fail. bun run test passes 169 checks, exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
