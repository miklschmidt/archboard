---
id: TASK-590
title: >-
  The shell takes the lit-table language of the site, in the light and the dark
  theme
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T12:41:00Z'
updated_date: '2026-11-07T12:47:00Z'
labels: []
dependencies: []
documentation:
  - site/DESIGN.md
  - site/design.json
  - DESIGN.md
  - docs/agents/frontend.md
priority: high
type: enhancement
ordinal: 1036000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner said that the mock shell pieces on the marketing site look much better than the shell itself, and asked the shell to take the visual language that site/DESIGN.md and site/design.json record. The owner also said that the shell keeps both its light and its dark theme, although the site is dark only. The site and the shell share fonts, the gold and the dark palette, but the site builds its planes differently: an inset hairline ring in place of a border, a lit top edge, a 1px to 2px contact line and a soft warm shadow on every plane, recessed troughs that hold tabs and rows, a raised face with a 2px gold underline for what is chosen, and larger corners. Until now each DESIGN.md told its reader not to reuse the other one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In the dark theme, the chrome, wells, raised controls, floats and dialogs of the shell use the plane ladder and the shadow vocabulary of site/DESIGN.md
- [ ] #2 The light theme builds the same pieces the same way (hairline ring, lit top edge, contact line, warm soft shadow, recessed trough) in chalk values
- [ ] #3 Primary and quiet buttons, segmented tabs, chosen rows, chips, key caps and code blocks of the shell follow the site components at the sizes of the shell
- [ ] #4 Text and marks keep the APCA levels of PRODUCT.md in both themes
- [ ] #5 The picture that the renderer draws does not change, and the theme parity browser test passes
- [ ] #6 DESIGN.md records the shell as built, and site/DESIGN.md says that the shell shares its language
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Foundation (TASK-590.01): the elevation tokens of app.css take the site vocabulary (raised, float, table, trough, hairline ring) in dark, and a chalk translation in light. Corners step to 4, 6 and 10px. ui-kit Button, Tabs, ToggleGroup, Badge and the select trigger take the gold button, the quiet button, the segmented trough and the chips. The shell chrome (column, header, right panel) uses them.
2. One subtask for each surface the owner named on 2026-11-07, each built from the foundation: the history timeline, the claim card, the explanation answer, the walkthrough in the right panel, the code findings with the content selector, the interface comparison of a proposal, and what changes together.
3. Screenshots at 1920x1080 in both themes before and after each surface, against the site mock.
4. Records: DESIGN.md, site/DESIGN.md, docs/agents/frontend.md and the reference capture.
<!-- SECTION:PLAN:END -->
