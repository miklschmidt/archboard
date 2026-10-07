---
id: TASK-425
title: >-
  A port is drawn as a real opening: the line keeps its width, nothing lies over
  it and traffic emerges from it
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 19:31'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
  - docs/adr/0027-explicit-traffic-controls-distance-based-animation.md
ordinal: 712000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner looked at the ports of TASK-424 in the dark theme (screenshot /home/msc/Pictures/Screenshots/screenshot-2026-10-06--19:56:30.png) and found four faults. The line that goes into a port does not match the width of the rest of the line. The bottom of the hole (the sill) is drawn on top of the line. The shadows of the card are cast onto the line. A traffic pulse is cut off behind the bottom edge of the card, and it should emerge from the hole and travel into it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The line inside the port, and where it meets the port, has the same width as the rest of the line
- [x] #2 The line is drawn over the sill and the floor of the hole and under nothing of the card, so the line comes out of the hole over its bottom
- [x] #3 No shadow of a card or of its slab is cast onto a line: the shadow layers lie under the lines
- [x] #4 A traffic pulse is seen inside the hole, emerging from it and entering it, and it is cut only at the lid of the hole, not behind the bottom of the card
- [x] #5 The result is judged at 1:1, 2x and 8x in both themes by looking, the state classes of a line (lit, selected, receded, ghost) still apply to everything that belongs to it, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Semantic renderer@TASK-423 records the built tray, port and shared-content ownership for this work. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 5836d8872. (1) Width: two lines sharing a port each drew a well, so the second covered the first's stub (Archboard server: hero 2.2 and normal 1.4 lines into one slot); now the first line in paint order draws the well (portPlan), every line draws its own stub at its own stroke width with a square end at the lid, and fades on its own width. (2) Sill: the card is clipped through a notch as wide as the line from the slot's bottom to the foot (holeOf), so the line runs over the sill and the lit floor into the hole; nothing of the card lies over it below the lid. (3) Shadows: a card's shadow (paintCardShadow) and a label's chip shadow (labelShadow) are groups class ab-shadow with data-members=<id>, painted after the regions and before every line; the veil and probe rules follow members; picture-transition parks .ab-shadow with the junctions until landing. A data-semantic-id shadow group was tried first and broke browser tests that take the first [data-semantic-id] as the card. (4) Traffic: rideInto extends a pulse's ride from a port end up to the lid (CARD_THICKNESS - LID + 1, less the 1 unit of air = the lid), so pulses show in the hole; an end with an arrowhead stops short of the head. Removed lines run into no port. Checked at 1x, 2x, 8x, 24x on Archboard server (Archboard board), Handshake (Codex session), Place order (Web shop), light and dark, selected, veiled with the line lit, veiled, and the marks fixture. Gate: lint, fmt, type-check, test:modules 3961 pass, test:system 187 pass (2 fail only in the non-git scratch copy; pass in the worktree), test:repository 20 pass, serial browser lane all pass. Renders: scratchpad proposals/slabs-s/port2-final (and rounds port2-r1, r2, r3; states/).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ports preserve the line width and expose traffic through the opening. Shadows sit below the lines. Port, traffic, and shadow owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
