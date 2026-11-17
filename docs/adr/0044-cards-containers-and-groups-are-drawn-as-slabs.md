---
status: accepted
---

# Cards and groups are drawn as slabs, and containers as trays

This decision supersedes parts of
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and
[ADR 0038](0038-groups-gather-and-colour-their-cards.md). Each of those records
names the sentences it replaces. The owner decided it on 2026-10-06, under
TASK-402.

## Context

Until this change the picture was flat. On 2026-10-06 the owner asked for
cleaner cards, containers and groups with more depth.

## Decision

The picture is lit from above. A card, a chip and a label stand on the page as
blocks. A container is cut into the page as a tray.

1. **Depth is flat shapes.** The picture uses no SVG filter, blur or mask for
   depth.
2. **The picture's contrast is judged with APCA** (TASK-432). The owner
   decided on 2026-10-07 that APCA, the Accessible Perceptual Contrast
   Algorithm, judges the contrast of the picture's words and marks, in place
   of the WCAG 2 contrast ratio (PRODUCT.md, Accessibility & Inclusion). The
   WCAG 2 ratio had held the light group tabs so dark that the owner found
   them terrible. The levels are APCA's Bronze levels, in Lc, at the size of
   the picture at 100 %: Lc 75 for a card's name and a label's words, Lc 60
   for a card's description and a group's caption, Lc 45 for a pin's mark,
   and Lc 30 as the floor for a line, a corner, an outline or a glyph, which
   aim at Lc 45 (`APCA` in the tests' `drawn-colours.ts`). APCA measures the
   words or the mark against what lies under it, in that order, since its
   result depends on the polarity.

## What stays

- **No filter over the picture.** The renderer draws depth with flat shapes
  only, as rule 1 says. The shell still paints nothing on the picture.
- **The layout of an architecture board.** Each slab and each tray is drawn
  inside the box that the layout gave it, so no card, container or region
  moves.

## Consequences

- **A vault changes nothing.** No board and no `config.yaml` changes. Every
  board of every vault draws in the new look on its next render. Exported SVG
  and PNG files change.
- **A picture draws more shapes.** The slab look drew 2.0 to 2.7 times the
  shapes of the flat look. Its SVG files were 1.5 to 1.8 times as large. These
  were measured before the tray, on five test boards, with the Track engine in
  the light theme. Nobody has measured how fast a large board drags with the
  slab look.

## Considered and not chosen

- **An SVG filter for the shadow.** The construction rules out a filter, a blur
  and a mask, because a picture of a hundred cards is dragged and zoomed.
  Stacked translucent shapes give a soft shadow without one.
