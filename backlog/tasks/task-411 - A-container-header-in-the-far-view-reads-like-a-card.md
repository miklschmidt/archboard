---
id: TASK-411
title: A container header in the far view reads like a card
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 10:21'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
ordinal: 698000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the picture is seen from far away, a card draws a big icon tile, a smaller name and the start of its responsibility (lib/svg/far-card.ts). A container header draws only its name, grown very large, and a small chip (lib/svg/far-view.ts, paintFarTitle, used by paintFarHeader in lib/svg/measured-cards.ts). The owner found this on the nameplate of a container in the far view: it should behave and look like a card, with a shorter responsibility, a bigger icon and a smaller title.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In the far view a container header shows a big icon tile, a name set smaller than today and the start of its responsibility cut to fit, in the same construction as the far layer of a card, in both themes
- [x] #2 The header keeps the room for its drill mark and its standing pin, and a header without a responsibility looks right
- [x] #3 The container header of a sequence view and of a nested container look right in the far view too
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read paintFarCard (lib/svg/far-card.ts) and paintFarHeader and paintFarTitle (lib/svg/measured-cards.ts and lib/svg/far-view.ts). 2. Build the far header from the same parts as the far card: a big icon tile, a name at the far name size or less, and the start of the responsibility, cut to its room, inside the header box and clear of the drill mark and the pin. 3. Render the Web shop, the Archboard server board and a sequence view in the far view in both themes and look. 4. Update tests, run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit c86f06a9. A container's far header is drawn by paintFarCard on the face of its nameplate (header height less the plate's front edge): the kind's tile grown to the plate, the name at a far card's size (15 to 20, so smaller than the shared far size the old header used), and the start of the responsibility cut to fit, one or two lines, clear of the drill mark; with no responsibility the name stands centred beside the tile. A flow's frame gets a far layer too (paintFarHeading): its name and summary at the far card sizes. Removed paintFarTitle, measureFarTitle, farTitleAt and the mark field of FarBox. Renders: scratchpad/proposals/slabs-s/h1 and h2 (shop-far, server-far, nest-far, seq-order-far, both themes).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Far container headers share the card construction and preserve the drill mark and standing pin. Far-view and header owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
