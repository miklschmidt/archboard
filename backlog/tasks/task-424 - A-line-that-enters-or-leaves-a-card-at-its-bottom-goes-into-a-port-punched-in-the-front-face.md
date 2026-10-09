---
id: TASK-424
title: >-
  A line that enters or leaves a card at its bottom goes into a port punched in
  the front face
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 13:03'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
  - docs/adr/0027-explicit-traffic-controls-distance-based-animation.md
ordinal: 781000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A card is a slab with a visible front face at its bottom. A line that enters or leaves a card at the bottom today runs under the card and simply meets the face. The owner sent a screenshot (/home/msc/Pictures/Screenshots/screenshot-2026-10-06--15:02:08.png) with red circles at the places where lines meet the bottom of the card Handshake and request path, and wants each of them to punch a hole, a port, in the front face, so that the line goes into the card. The colors of the screenshot are not a direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A line that meets a card front face enters a port cut through that face in both themes. Sequence lifelines keep their gap below the cards, as ADR 0044 and TASK-439 define.
- [x] #2 The port follows the state of its line (lit, selected, receded, standing, ghost) and the traffic pulses of the line sink into it, and the port is not drawn where no line meets the face
- [x] #3 Ports keep the hit atlas and routes unchanged, use no filter or blur, and follow the far-view choice in TASK-430. The notes record their shape cost.
- [x] #4 ADR 0044 says how a port is drawn, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Semantic renderer@TASK-423 records the built tray, port and shared-content ownership for this work. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 204bb9572. lib/svg/ports.ts: a slot cut through the front edge where a line's end lies on a card's foot (|y - foot| < 0.5). Slot: lid 0.6, sill 0.7 (2.7 tall, stadium ends), half length = line/2 + SOCKET 2.1, narrowed to keep 5.25 from the box sides (inside the rounded corner) and WEB 1.5 between slots; dropped below line/2 + 0.5. The card body and shadow rects carry clip-path (userSpaceOnUse, page minus slots, id ab-port-<content hash>). The line's group draws, near only, class ab-near ab-port: the well (path, radial gradient ab-port-well, --port-deep to --port-wall), a lit crescent floor (--tray-lip) and a stub line with the line's own stroke. The card draws the fade (ab-port-fade) near and a closing patch in its front edge colour far. Tokens: light --port-wall 0.52/--port-deep 0.3, dark 0.13/0.06. Viewer: picture-lines parks .ab-port in flight. Cost: 6 elements per port, 4 per cut card, +2.2 to 2.4% SVG (Codex session: 12 ports, 6 cards; Web shop Synchronous checkout: 4 cards). Test: ports.test.ts. Renders: scratchpad proposals/slabs-s/port-ab (1x, 2x, 4x, 12x and 14x crops, far 4x); rounds port-r1, port-r2, port-r3.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 1: Where a line starts or ends at the bottom of a card, where the front face shows, the face has a port: a small hole with some depth, cut through the front face, and the line goes into it, in the light and the dark theme, in architecture boards and for the lifelines of sequence participants
Original criterion 3: The hit atlas, the routes, the layout and the far view are unchanged, no SVG filter or blur is used, and the cost in drawn shapes per port is small and stated in the notes

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Architecture lines enter ports in the front face of cards. Sequence lifelines retain their documented clearance below participants. Port and sequence owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
