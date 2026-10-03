---
id: TASK-386.04
title: >-
  A far view shows the structure, and relationship labels return where the
  reader looks
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 674000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fitted to the pane, Archboard server draws every relationship label at 0.45 of its size, about 5 pixels, which nobody can read. The labels sit over the lines they name and make a dense board look like noise. A card already draws a larger far variant below a scale (FAR_SCALE) and cross-fades between the two over FAR_VIEW_FADE_MS. A reader who comes close, or who lights a part, wants the labels back.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Below the scale at which a label cannot be read, relationship labels fade out, and they fade back as the camera passes that scale
- [ ] #2 A relationship that is lit or selected keeps its label at any scale
- [ ] #3 A still picture from semantic render and semantic rasterize keeps every label
- [ ] #4 The fade follows the timing of the far view and honors reduced motion
<!-- AC:END -->
