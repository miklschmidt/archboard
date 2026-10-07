---
id: TASK-435
title: >-
  A slab shadow in the light theme stays outside its card, and a port lip is
  less bright
status: To Do
assignee: []
created_date: '2026-10-07 00:10'
updated_date: '2026-10-07 00:40'
labels: []
dependencies: []
ordinal: 720000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner looked at a card in the light theme at high zoom (screenshot /home/msc/Pictures/Screenshots/screenshot-2026-10-07--02:09:23.png) and saw the shadow bleed into the card: the shadow layers show on the lower part of the front edge as a bluish strip and run up along the card side. The dark theme is fine. The owner also said that the lip at the bottom of a port is a little too bright.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the light theme, no shadow shape is painted on a card, on its front edge or on its face, whether that card is the one that casts the shadow or a card next to it
- [ ] #2 The front edge of a card in the light theme has one even tone along its whole height, with no strip of the shadow in it
- [ ] #3 The lip at the bottom of a port is a little less bright in both themes, and it still reads at 2x
- [ ] #4 The dark theme and the sequence diagram look the same as before, apart from the port lip
- [ ] #5 A renderer test holds the drawing order, so that every card shadow lies below every card
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause, from pixels at 10x: no shadow shape was drawn over a card. The front edge was one even tone (#C1C2C4) from the face to the foot. The bluish strip was the contact shadow under the foot, 0 to 2 units below the box, where the two densest layers overlap (#BEC0C5). It had the lightness of the edge (OKLCH 0.808 against 0.814) and a bluer hue, so the edge seemed to run on 2 units into it. The band up the left side was the three softer layers, which grew past the card's left side by up to 3 units, darkest (#D4D8DD) right beside the face. The dark ground hid both because its shadow is much darker than its edge.

Fix: each shadow layer now has a share for each ground (slab.ts). The dark ground keeps its five layers unchanged. On the light ground the contact shadow is lighter than the edge (about #D4D4D7 under the foot, OKLCH 0.87), and three light-only layers are moved right as far as they grow, so they fall only down and to the right. A faint ring a unit wide stays round the card. A layer one ground does not use is transparent there, so a card's shadow is eight rects (1.3% to 2% more SVG). A new shadowUnder in slab.ts draws every card and label shadow group, and a sequence now lays its participants' shadows in its head under its cards, so every card shadow lies under every card in Track, Blocks and the sequence. The port lip is OKLCH 0.93 0.004 255 in light (was 1 0 0) and 0.61 0.004 75 in dark (was 0.66), about four fifths of the light each gave.

Test: src/runtime/semantic-renderer/tests/slab-shadows.test.ts holds the order (Track, Blocks, sequence) and holds the shadow under a card's foot at least 0.04 OKLCH lightness apart from the front edge in both themes. The sequence test and the light test fail on the code before this change. Docs: ADR 0044 rules 2 and 16, DESIGN.md, theme.css.
<!-- SECTION:NOTES:END -->
