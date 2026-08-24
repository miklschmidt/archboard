---
id: TASK-088
title: >-
  Arrow routing reads the agent input shape instead of the binding, so a human's
  re-bind is undone
status: Done
assignee:
  - '@claude'
created_date: '2026-08-21 12:42'
updated_date: '2026-08-24 11:06'
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
Measured against a throwaway canvas, not reasoned about. `scripts/probe-arrow-refs.mjs` reproduces it.

An agent draws an arrow from box A to box B, writing the agent-friendly shape `start: {id: boxA}`. A human drags the tail off A and onto box C. Excalidraw updates `startBinding` and has never heard of `start`, so the two disagree:

```
start        = {"id":"boxA"}    <- stale
startBinding = "boxC"           <- what the human did
```

An agent then moves box A, which the arrow no longer touches, and the server drags the arrow anyway:

```
points before = [[0,0],[300,-270]]
points after  = [[0,0],[285.6891649440014,142.84458247200067]]
```

The human's edit is undone by a later, unrelated move.

## The cause is the lever, not the staleness

`resolveArrowBindings` routes an arrow by reading `start` and `end` — the agent input shape — and never consults `startBinding` or `endBinding` at all. So the refs are not extra information the binding lacks; they are the only thing the router looks at, and they are stale the moment a human moves an end.

`expand-elements` already builds the binding correctly from the input (`{elementId, focus: 0, gap: 4, fixedPoint: null}`) and the router then ignores it. It also imposes its own `GAP = 8`, so the binding records one distance and the routing uses another for the same arrow.

The router discards `focus` entirely, routing centre-to-centre. That is the whole reason an earlier attempt to drop the refs looked dangerous: routing by binding would then have widened to hand-drawn arrows and moved them onto a centre-to-centre path with the wrong gap. That is the router being wrong, not a reason to keep a duplicate field — an arrow a human drew carries the `focus` and `gap` they chose by where they attached it, and a router that honours those can re-route any bound arrow safely.

There is no notion of an arrow belonging to the agent or to the human. This is a collaborative board and both draw on it; the only question is whether a path is recomputed correctly.

## Why this is not just a bug

ADR 0015 says the agent-friendly shape is an input format, converted once on the way in and never stored. TASK-073 removed the label seed on exactly that basis. The arrow refs kept a special case the ADR does not grant them, and this is what the special case cost.

Note that `src/core/expand-elements.ts` and `scripts/check-labels.mjs` both carry comments justifying the refs in terms of which arrows the server may route. Those comments encode the wrong framing and should go with the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 resolveArrowBindings selects and routes arrows by startBinding and endBinding, and never reads start or end
- [x] #2 The router honours each binding's own focus and gap instead of imposing a hardcoded gap, so re-routing a hand-drawn arrow leaves it where its binding says
- [x] #3 start and end are input-only and are not stored, like label since TASK-073, which is what ADR 0015 already requires
- [x] #4 Re-binding an arrow's end in the browser and then moving the old shape leaves the arrow where the human put it
- [x] #5 Dragging an arrow's end into empty space is covered, not only re-binding it to another shape
- [x] #6 A check reproduces the measured failure and fails without the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Convert the agent refs at the input boundary. One shared helper in expand-elements.ts turns start/end into an Excalidraw binding with one gap constant (BOUND_ARROW_GAP), called from buildCreatedElement and mergeElementUpdate as well as from expandElementsForExport, so there is one definition of the conversion. start and end never reach the store, exactly as label stopped in TASK-073.
2. New pure module src/core/arrow-binding.ts, ported from Excalidraw's own element/binding.ts (determineFocusPoint and updateBoundPoint, read from the dev source maps in node_modules). It honours each binding's focus and gap. The outline offset is analytic (rect half-extents, ellipse semi-axes, diamond vertices, each plus gap, in the element's unrotated frame) rather than Excalidraw's per-corner bezier offset; the difference is bounded by gap near a rounded corner and is documented.
3. resolveArrowBindings selects by startBinding/endBinding and never reads start/end. It moves only the bound edge point and preserves interior points, so a hand-drawn multi-point arrow is no longer flattened. Elbowed arrows are skipped: routing one is a whole orthogonal router we do not have, and today they are flattened.
4. On creation the adjacent point is seeded at the bound element's centre, so a bound arrow still lands on the centre-to-centre line, which is the fixed point of one pass at focus 0. On a re-route it is the arrow's own other endpoint, which is what Excalidraw uses.
5. Fold the probe's scenario into scripts/check-geometry.mjs: re-bind then move the old shape, and drag an end into empty space. Both fail without the fix.
6. Delete the two comments that justify the refs by which arrows the server may route (expand-elements.ts, check-labels.mjs), the (el as any).start writes in library-catalogue.ts, and update check-library.mjs to assert the binding.
7. Prove by reverting each change and counting which checks fail.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Ported Excalidraw's own binding geometry into src/core/arrow-binding.ts: determineFocusPoint and updateBoundPoint, read out of the source maps @excalidraw/excalidraw ships in dist/dev rather than guessed at. focus is honoured properly, not documented as a gap.

One approximation, in the file's header comment. Excalidraw expands a shape's outline by gap corner by corner (each rounded corner's bezier pushed out along its own diagonal, the straight sides re-hung between the moved corners). Here the outline is expanded analytically: half-extents plus gap for a rectangle and a diamond, semi-axes plus gap for an ellipse, and a rounded corner treated as a square one. The two differ only within a corner radius of a corner and by at most gap, which is 4px. Doing it faithfully means cubic-bezier/segment intersection plus Excalidraw's corner-radius rules.

Two decisions the task did not name, both from reading updateBoundPoint:
- Only the bound ends move. The old router rewrote points to [[0,0],[dx,dy]], so once selection is by binding it would have caught hand-drawn multi-point arrows and flattened them. A three-point arrow keeping its bend is checked.
- Elbow arrows are skipped. Their path is an orthogonal route Excalidraw recomputes whole; moving one endpoint would leave a route that no longer turns square corners. Today they are flattened, so this is strictly better.

On creation the aim comes from the bound shapes' centres rather than from the placeholder points an agent supplied, which at focus 0 is the centre-to-centre line and is a fixed point of running the routing again. On a re-route it comes from the arrow's own next point, which is what Excalidraw uses.

scripts/probe-arrow-refs.mjs hardcoded one developer checkout path, so it measured that clone whichever checkout it was run from. It resolves the repo from its own location now and reports 'the arrow was left alone'.

Revert-proof, whole suite each time (0 failures with the fix in place):
- refs stored and read again (the bug): 4 of 82 geometry checks fail, including the measured one, 'moving a shape the arrow no longer touches dragged it from [[0,0],[300,-270]] to [[0,0],[292,41.9]], undoing where a person put it'.
- routing gap hardcoded to 8 again: 4 of 82 fail.
- focus ignored, routing centre to centre: 4 of 82 fail.
- path flattened to its two ends: 2 of 82 fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
resolveArrowBindings selects and routes by startBinding/endBinding and never reads start/end, honouring each binding's own focus and gap. src/core/arrow-binding.ts is the geometry, ported from Excalidraw's element/binding.ts (determineFocusPoint, updateBoundPoint) out of its dev source maps; the outline offset is analytic rather than corner-by-corner, which differs within a corner radius of a corner by at most gap and is documented in the file. start and end are spent in buildCreatedElement and mergeElementUpdate and are not stored, like label since TASK-073; start: null unbinds an end. One gap constant, BOUND_ARROW_GAP, read by the conversion and the routing (TASK-089 AC 1). Only bound ends move, so a hand-drawn bend survives; elbow arrows are skipped and the reason is written down.

Verified: scripts/probe-arrow-refs.mjs reports the arrow left alone. check-geometry covers the arithmetic and the failure at 82 checks, up from 65: the re-bind then an unrelated move, an end dragged into empty space, a three-point arrow keeping its bend, and a person's own focus and gap surviving a box moving and moving back. bun run test green, 22 steps including both browser checks. Reverting the fix fails 4 of the 82; hardcoding the gap fails 4; ignoring focus fails 4; flattening the path fails 2.
<!-- SECTION:FINAL_SUMMARY:END -->
