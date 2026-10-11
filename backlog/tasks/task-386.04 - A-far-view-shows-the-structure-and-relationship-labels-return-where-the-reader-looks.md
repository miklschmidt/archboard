---
id: TASK-386.04
title: >-
  A far view shows the structure, and relationship labels return where the
  reader looks
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
updated_date: '2026-10-03 16:07'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 725000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fitted to the pane, Archboard server draws every relationship label at 0.45 of its size, about 5 pixels, which nobody can read. The labels sit over the lines they name and make a dense board look like noise. A card already draws a larger far variant below a scale (FAR_SCALE) and cross-fades between the two over FAR_VIEW_FADE_MS. A reader who comes close, or who lights a part, wants the labels back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Below the scale at which a label cannot be read, relationship labels fade out, and they fade back as the camera passes that scale
- [x] #2 A relationship that is lit or selected keeps its label at any scale
- [x] #3 A still picture from semantic render and semantic rasterize keeps every label
- [x] #4 The fade follows the timing of the far view and honors reduced motion
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A far view (the camera under FAR_SCALE, the surface's is-far) already swaps each card for its larger name-only variant. Relationship labels are 9 units, about 5 px at the fit of the densest board, so they join that swap: in the page's stylesheet (app.css), not the picture's own, so semantic render and rasterize write the same bytes. 2. A relationship's label (data-semantic-kind edge, data-semantic-part label) fades out under is-far and back as the camera passes the scale, over FAR_VIEW_FADE_MS, unless it is lit or selected. Step labels of a sequence are not relationship labels and stay. 3. The fade's duration comes to the surface as a custom property from the timing module, as the presentation step's does. 4. Tests: a stage test that the label of a lit relationship stays and a plain one is hidden under is-far. 5. Board proposal: none; the Board viewer draws no part for this.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured in headless Chromium at 1920x1080 on Archboard server (dark and light): fitted at 0.26 to 0.32, the picture drew 52 relationship labels at about 5 px and all 52 are now hidden (visibility hidden, so they are not hovered or picked either); a pick of Board write routes brings back exactly its 7 labels (the lit ones) and leaves the other 45 hidden; 12 wheel notches zoomed to 0.818, which ended the far view and showed all 52, and 14 notches out brought it back to 0.216 with 52 hidden. The rule lives in app.css and not in the picture's own stylesheet, so semantic render and rasterize write the same bytes (src/transformers and src/runtime are untouched). The label is hidden by the same is-far class that swaps a card for its name, so the far view stays one concept; a sequence's step labels are not relationship labels and stay. The fade is FAR_VIEW_FADE_MS, handed to the surface as a custom property, and reduced motion removes it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A picture seen from far away now shows its structure and not its words: relationship labels, under 6 px there and sitting on the lines they name, fade out with the same is-far class that swaps a card for its name, stay for a relationship that is lit or picked, and return as the camera comes close. Verified in headless Chromium on the densest board (52 hidden at fit, 7 returning on a pick, 0 hidden when zoomed in) and by the unchanged exports. Board proposal: none, since the Board viewer draws no part for this.
<!-- SECTION:FINAL_SUMMARY:END -->
