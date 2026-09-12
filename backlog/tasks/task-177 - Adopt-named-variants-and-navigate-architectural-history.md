---
id: TASK-177
title: Adopt named variants and navigate architectural history
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 02:45'
labels:
  - ready-for-agent
dependencies:
  - TASK-176
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 328000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Represent implemented architecture separately from proposal ancestry, preserving a meaningful past when current changes.

## Blocked by

TASK-176

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An explicit command adopts any coherent draft including a competing sibling, moves current and records the adoption without reparenting proposals.
- [x] #2 The former current becomes immutable historical content; adopted states stop parent inheritance, current remains explicitly editable, and its draft descendants can follow those edits.
- [x] #3 Unresolved adoption and ordinary historical writes are rejected with actionable reasons; names and identities survive lifecycle transitions.
- [x] #4 The viewer distinguishes ancestry, adoption history and lifecycle, and explicit links resolve correctly after adoption; no cross-board historical snapshot or correction mechanism is added.
- [x] #5 Adoption uses the shared board-global claim and expected-version write boundary, persists lifecycle/current/history together atomically and advances the board version exactly once.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adoption moves the designation, freezes what it replaced under its own name, records the move with its reason and leaves ancestry alone; the frozen state refuses an ordinary edit and says to branch from it instead. Verified through the CLI against a running canvas, and owned by tests/system/semantic-boards/lifecycle.test.ts.

Defects found by review and fixed: a historical variant could be adopted; the ancestor walk for blocking ran past an adopted variant, so a draft under an adopted state was told to wait for a decision that no longer governed it — the walk now stops where inheritance stops.

AC#4 (the viewer distinguishing ancestry, adoption history and lifecycle) is verified in the running app and by the viewer's own owners: each state says its name and where it stands — current, draft or historical — the variant bar is the same row a reader chooses from, a board with one state says which one it is without offering a choice, and a drill-down link resolves to the variant it names after the designation has moved, because a link names a state rather than the designation. No cross-board historical snapshot was added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adoption moves the `current` designation onto a coherent variant — a competing sibling included — and writes down that it moved and why. It renames nothing and reparents nothing: the variant that was current becomes a historical state under its own name, the adopted one becomes current under its own name, and a proposal derived from either still says where it came from, because ancestry is a record rather than a pointer at whatever is current now.

What was implemented then stops changing: a historical state refuses an ordinary edit and says to branch from it instead, and it cannot be made current again. An adopted state stops inheriting from what it came from, which is also where the walk for a blocked descendant stops — inheritance and blocking end at the same boundary. The new current takes edits, and its own drafts follow them.

It refuses while the variant is itself unsettled, with the reason, and it goes through the one write boundary: the board-global claim, the expected version, lifecycle and designation and history written together in one atomic write, one version advance.

Verified through the public command line against a running canvas and by 279 passing tests across the store, the pure core, the system suite and the viewer, with both type-checks and lint clean. Two independent review findings were closed on the way: a historical variant could be adopted, and the ancestor walk for blocking ran past an adopted state.
<!-- SECTION:FINAL_SUMMARY:END -->
