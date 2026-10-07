---
id: TASK-430
title: >-
  Ports stay visible when the picture is zoomed out, and the remaining port
  differences are fixed
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 716000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked that the holes (ports) are not hidden when zooming out, and asked for the differences that were listed after TASK-425 to be fixed: a pulse that arrives in an arrowhead does not enter the hole, the shadow of a card is not partly faded with its card in the reach states of a trace (is-reach-2 to is-reach-4), a selected line is raised above the cards so its halo and pulses can show over the front edge around a slot, activation bars in sequence diagrams keep their shadow in the old place, during a flight the port clip stays where the card will land, and the lit lip of a port is faint in the dark theme.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A port is drawn in the far view as well as the near view, on every card that has a line at its foot, and the far-to-near transition carries it
- [x] #2 A pulse that arrives in an arrowhead at the foot of a card enters the hole, a card shadow fades with its card in every state including the reach states, a selected line does not draw its halo or pulses over the front edge of a card, activation bars put their shadow in the shadow layer under the lines, a flying card keeps its slot with it, and the lip of a port reads in the dark theme
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Semantic renderer@TASK-423 records the built tray, port and shared-content ownership for this work. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 620af9f5f. Its DESIGN.md sentence went into the palette agent's docs commit 7e1850bea.
(1) Far view: the port group has the class ab-port only (no ab-near), and the far patch (portClosed) is gone. So the holes stay when the picture is far, and the TASK-428 swap neither moves nor fades them.
(e) The cut is a clipPath in objectBoundingBox units on the card's body (holeOf writes the hole in shares of the card's box). So a card that a flight carries takes its holes with it.
(a) A pulse that arrives in an arrowhead at a port: headReach is 0 at a port end (endsInPort). So the pulse rides over the head (pulses are painted over all lines) and on to the lid, as any other end does.
(b) markReach grades .ab-shadow[data-members] with the reach of its card (membersReach).
(c) The viewer raises a selected line or its traffic under the first card drawn after it (nextCard), not to the end of the picture. So its halo and its pulses show only in the ports.
(d) Activation bars: their slab shadows are drawn first in the lifeline group, under the lifeline. Messages are drawn after every column.
(f) --port-lip: light oklch(1 0 0), as before. Dark oklch(0.66 0.004 75); it was --tray-lip at 0.3.
Tests:
- ports.test.ts: no near or far class on a port, an objectBoundingBox cut, and an arriving pulse that reaches past the foot to the lid.
- semantic-board-reach: a card's shadow is lit and graded with its card.
- semantic-board-picking: a raised line goes under the next card.
- crossings.test: the port group is left out of a line's own paths.
Gate on a full copy:
- These lanes pass: lint, fmt, type-check, build, test:modules, and the serial browser lane (19 files).
- test:system and test:repository fail only on 3 git-dependent tests, because the copy is not a git repository. Those 3 tests pass in the worktree.
Renders, in the scratchpad: proposals/slabs-s/port3-r1 and port3-r2 (far-*, lip-*, raised-8x, arrive-frames-dark, seq/bars-6x).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ports remain visible in the far view and follow the card during flight. Line clipping, traffic, and reach states use the same opening. Port owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
