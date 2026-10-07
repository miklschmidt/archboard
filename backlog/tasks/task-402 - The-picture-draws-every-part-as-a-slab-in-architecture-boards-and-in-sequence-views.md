---
id: TASK-402
title: >-
  The picture draws every part as a slab, in architecture boards and in sequence
  views
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 02:23'
updated_date: '2026-10-06 03:53'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0025-containment-and-type-own-distinct-visual-channels.md
  - docs/adr/0038-groups-gather-and-colour-their-cards.md
ordinal: 689000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner asked for cleaner cards, containers and groups with more depth, and chose the Slabs proposal on 2026-10-06 from three built redesigns (Vellum, Slabs and Pockets). Slabs draws a part as a block with a lit top face and a front edge, and takes the group colour as the colour of that edge. The proposal covers architecture boards only. The owner found that sequence views were overlooked and still draw flat outlined boxes, and that the change marks (added, changed, removed) draw a second box inside a card. The owner also finds the container header weak. A finish review left two partial findings: dark nesting steps are too close in value, and a route can run through the caption tab of a group in the far view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A card, a container and a group region are drawn as slabs in the light and the dark theme, and no part of an architecture board has a colored outline
- [x] #2 A sequence view draws its frame as a plinth, its participants as slabs, its message labels as slab chips and its activation bars as slab bars, and no flat outlined box is left in it
- [x] #3 A part that a proposal added, changed or removed shows its standing without a second box inside the part and keeps the colour of its group edge, for cards, containers, participants and labels, in both themes
- [x] #4 A container header is a raised nameplate with its own front edge, and the lines that the container sends out still leave from its lower edge
- [x] #5 In the dark theme each nesting level of containers is one visible step lighter, and no route runs through the caption tab of a group in the far view
- [x] #6 ADR 0025, ADR 0038 and DESIGN.md describe the slabs, and every README picture that the change made stale is made again or is listed for a person to make
- [x] #7 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rebase surface-depth/slabs onto main (done 2026-10-06). 2. Draw a sequence view with the slab language: the frame is a plinth with a nameplate header, a message label is a slab chip like an architecture label, an activation bar is a slab bar, a participant is a slab. 3. Redraw the standing marks so that no second box sits inside a part. A face wash, the pin and, for a removed part, a flat dashed footprint carry added, changed and removed. The group edge stays. This holds for cards, containers, participants and labels. 4. Draw the container header as a raised nameplate with its own front edge and a clear tint of its kind. The lines that a container sends out keep leaving from its lower edge. 5. Make each dark nesting level one visible step lighter, and keep a route out of the far-view caption tab of a group. 6. Write ADR 0025 and ADR 0038 amendments and the picture section of DESIGN.md. Make the README pictures again that the change made stale and list the others. 7. Board proposal: Semantic renderer@TASK-402 adds the part Slab surfaces (lib/svg/slab.ts) and the lines from both painters to it. Adopt it when the task closes. 8. Verify by rendering every board of both vaults in both themes, running the browser tests of the picture, and running bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-10-06 on branch surface-depth/slabs, rebased on main. bun run check exits 0 (lint, fmt:check, type-check, frontend build, module, system, repository and serial browser lanes). Three independent finish reviews of the picture ran, and the last verdict fixes were applied and looked at again in the renders. I looked at the renders of the Web shop board, its proposal compared with the current variant, the server, system and browser boards, the far view and the sequence views, each in both themes, and at 2x close-ups of the nameplate and the change marks. A removed part keeps a dashed red footprint, which is its standing mark and the only outline left on a part. Known and left on purpose: the neutral message lines and lifelines of a sequence view are about 2 to 1 in contrast, as before. The still pictures show a frozen frame of the traffic pulses. README: the three diagrams, the banner and their thumbnails are made again. Nine assets are still stale and need a person: the clips hero, plan, history, drill-down and take-back, and the Codex assets ask, explainer, pr-walkthrough and newcomer. The social card at docs/assets/archboard-social-card.jpg changed and must be uploaded by hand under Social preview in the repository settings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cards, containers, group regions, relationship labels and sequence views are drawn as slabs (ADR 0044). A container is a plinth with a raised nameplate that carries its kind. A group is a mat with a caption tab. The group color is the color of a card front edge. A sequence frame is a plinth, a message label is a slab chip and an activation bar is a slab. A change mark is a wash of its color on the face, a pin and a hatch for changed, and a removed part is a flat dashed ghost. ADR 0025, 0038 and 0042 are amended, DESIGN.md describes the picture depth, and the Semantic renderer board has the part Slab surfaces. Verified with bun run check (exit 0), finish reviews and renders in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
