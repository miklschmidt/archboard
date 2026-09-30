---
id: TASK-330
title: A flow's frame widens for a self-step label on its last column
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:37'
updated_date: '2026-09-24 14:06'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 571000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-327 and confirmed by TASK-328.03: in the Renderer layout board's 'Layout sequence' view, the self-step 'Place with Graphviz, route around cards with libavoid' on the rightmost column (Layout engine) runs past the flow frame's right edge: the frame ends near x=672 and the label near x=818, although the page is wide enough. The frame width does not count a self-step label on the last column.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A self-step label on a flow's last column lies inside the flow frame
- [x] #2 One test owner fails without the fix
- [x] #3 Every view of every dogfood board still draws, and the renderer's recorded scorecards are unchanged or better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cause: layoutFlow (lib/layout/dataflow.ts) sizes the flow frame from the participant columns alone. A message's ink (stepBox: a self-step's loop and label, a crossing label longer than its arrow) is counted only by the page.
2. Fix: frameSpan in lib/layout/messages.ts widens the frame from the columns-only span around every message's stepBox, with the columns' NEST_INSET on both sides. layoutFlow uses it. The header and columns do not move. The painter's page becomes the union of the frames.
3. Test owner: src/runtime/semantic-renderer/tests/flow-frame.test.ts, shown to fail on HEAD's layout.
4. Measure every view of every dogfood board on a vault copy, before and after, and look at every changed picture.
5. Run the gate lanes one at a time, then commit.
Boards: none affected. Frame sizing is not architecture that any dogfood board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: layoutFlow sized the frame as NEST_INSET*2 + the columns' width. A message's ink (stepBox: a self-step's loop and label plate, a crossing label wider than its hop, a note) was counted only by the page (paintDataFlow unioned step boxes into the canvas). So the page widened and the frame did not.
Fix: frameSpan (lib/layout/messages.ts) widens the frame from the columns-only span to cover every message's stepBox, with NEST_INSET on either side, in whole units. layoutFlow uses it (dataflow.ts stays at 599 of its 600-line cap). The header and columns do not move. A frame that grows left (a crossing label longer than a first-column hop) moves the page through canvasFor's shift. The painter's page is now the union of the frames, because a frame holds everything its flow draws. messages.ts imports its dataflow types with import type, so the new runtime import is not a cycle.
Test owner: src/runtime/semantic-renderer/tests/flow-frame.test.ts. It covers a self-step on the first and last column, two self-steps on the last column (one with a note), long crossing labels on the left and right edges, and a one-participant flow. It fails with HEAD's dataflow.ts and passes with the fix. It is a new file because dataflow.test.ts is at its 500-line lint cap.
Drawings: all 48 SVG and PNG outputs of the dogfood vault copy (every board whole, every view; Voice coordinator / Workhorse news fails on HEAD too, the TASK-329 route defect) were compared byte for byte before and after. Only Renderer layout@Layout sequence changed: its frame now closes around 'Place with Graphviz, route around cards with libavoid', and the page grew from 835 to 853 px. The other five data-flow views and all 28 architecture pictures are byte-identical.
Gate note: wide-boards.test.ts 'Archboard server: complete architecture…' times out on HEAD's renderer source as well (60 s, measured with my files swapped back to HEAD) under load average 20-28. Its wasm abort then fails the later wide-board cases. This is the architecture grammar, which this change does not reach.

Gate (each lane on its own, load average 20-28 from a concurrent TASK-329 measurement): type-check 0, lint 0, fmt:check 0. test:modules exit 1: 3391 pass, 10 fail, all in wide-boards.test.ts 'complete architecture'; the first timed out and the rest failed after the wasm abort. The Archboard server case also times out at 60 s on HEAD's renderer source, and in an isolated run with a 20 s timeout 17 of 18 passed. test:system exit 1: 179 pass, 1 fail (server-startup-signal, a 350 ms health window under load); run alone it passes 2 of 2. test:repository exit 0. test:serial-browser exit 0. Committed as d12719f0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A flow's frame now holds every message's ink. Before, it covered only the participant columns, so a self-step label on the last column (Renderer layout / Layout sequence: 'Place with Graphviz, route around cards with libavoid') ran past the frame's right edge although the page had grown to hold it. frameSpan (lib/layout/messages.ts) widens the frame around every message's stepBox with the columns' inset, on both sides. The page is now the union of the frames. The test owner is flow-frame.test.ts: a self-step on the first and last column, two self-steps with a note, long crossing labels at both edges, and a one-participant flow. It fails on HEAD's layout. All 48 dogfood drawings (every board whole and every view) were compared before and after, and only Layout sequence changed: its frame closes around the label and the page grows from 835 to 853 px. The architecture pictures are byte-identical, so the recorded scorecards cannot move. The wide-board 'Archboard server' scorecard case times out under load on HEAD as well.
<!-- SECTION:FINAL_SUMMARY:END -->
