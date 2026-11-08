---
id: TASK-605
title: Settings dialog holds the picture settings beside the code opener
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T13:44:00Z'
labels:
  - frontend
  - design
dependencies: []
ordinal: 1062000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout engine and Dim on hover stand at the foot of the right panel under the legend. With the chrome now one plane round the picture, that stack reads as clutter beside the canvas. The owner asked to move both into the settings dialog, which today only holds the code opener, and to give that dialog some care so it reads as the place for the shell settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The header gear opens one Settings dialog with a tab for the picture settings and a tab for the code opener
- [ ] #2 Layout engine and Dim on hover are set in the picture tab, take effect at once and persist in the browser as before
- [ ] #3 The right panel no longer shows Layout engine or Dim on hover
- [ ] #4 A notice that asks for the opener settings opens the dialog on the code opener tab
- [ ] #5 The opener keeps its test, save, reset and keyboard contract inside the new dialog
- [ ] #6 Browser tests and the docs (DESIGN.md, docs/agents/frontend.md, docs/design/reader-redesign.md) describe the new place
<!-- AC:END -->
