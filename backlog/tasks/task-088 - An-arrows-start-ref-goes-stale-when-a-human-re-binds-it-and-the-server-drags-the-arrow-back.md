---
id: TASK-088
title: >-
  An arrow's start ref goes stale when a human re-binds it, and the server drags
  the arrow back
status: To Do
assignee: []
created_date: '2026-08-21 12:42'
labels: []
dependencies:
  - TASK-073
references:
  - src/core/expand-elements.ts
  - src/server.ts
  - src/core/board-io.ts
priority: high
type: bug
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured against a throwaway canvas, not reasoned about.

An agent draws an arrow from box A to box B, so it carries `start: {id: boxA}` and the server owns its path. A human drags the tail off A and onto box C. Excalidraw updates `startBinding` and has never heard of `start`, so the arrow comes back with the two disagreeing:

```
start        = {"id":"boxA"}    <- stale
startBinding = "boxC"           <- what the human did
```

Then an agent moves box A — a box the arrow no longer touches. `rerouteBoundArrows` selects arrows by `start.id` and `end.id`, so it still believes the arrow starts at A and recomputes its path:

```
points before = [[0,0],[300,-270]]
points after  = [[0,0],[285.6891649440014,142.84458247200067]]
```

The human's re-binding is silently undone by a later unrelated move.

This is the family TASK-024, TASK-028 and TASK-029 belong to: one fact spelled twice, a rule deciding which spelling wins, and the rule being wrong. TASK-073 removed the label seed for exactly this reason and left the arrow refs in place, on the argument that they are not a second spelling of `startBinding`. That argument is half right. They do carry something `startBinding` does not — that the server computes this arrow's path rather than Excalidraw, which is what stops the server jerking a hand-drawn arrow onto its own simpler route. But they also carry which shape the end attaches to, and that half **is** a second spelling, and it is the half that goes stale.

So the fix is not to delete them. It is to stop them carrying the target at all: keep the marker that says whose path this is, and read the target from `startBinding`, which is the one place Excalidraw and archboard both write. Then a human's re-bind cannot disagree with anything, because there is nothing left to disagree with.

Worth checking whether `end` has the same problem — the probe only exercised the tail — and whether a human deleting a binding entirely (dragging an end into empty space) leaves a ref pointing at a shape the arrow has left.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Re-binding an arrow's end in the browser and then moving the old shape leaves the arrow where the human put it
- [ ] #2 An arrow's stored refs no longer name a shape, so they cannot disagree with startBinding
- [ ] #3 The server still routes only the arrows whose path it owns, and still leaves a hand-drawn arrow alone
- [ ] #4 Dragging an arrow's end into empty space is covered, not only re-binding it to another shape
- [ ] #5 A check reproduces the measured failure and fails without the fix
<!-- AC:END -->
