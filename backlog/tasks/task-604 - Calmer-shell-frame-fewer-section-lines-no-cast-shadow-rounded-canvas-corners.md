---
id: TASK-604
title: >-
  Calmer shell frame: fewer section lines, no cast shadow, rounded canvas
  corners
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-08T13:12:00Z'
updated_date: '2026-11-08T13:21:00Z'
labels:
  - frontend
  - design
dependencies: []
ordinal: 1061000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell divides its column and right panel into sections with one-pixel lines, and the chrome casts a soft shadow band with an offset onto the picture on every side. Together they make the shell look busy and cheap next to the picture. The owner asked to clean up the internal section borders, remove the overdone shadow on the canvas, and round the inner corners where the chrome meets the canvas. DESIGN.md defines these pieces (the edge-* shadows, the Right panel, the legend tray, the Planes Not Lines Rule), so it changes with the code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sections inside the left column and the right panel are parted by space or tone, not by one-pixel lines, except where a line draws the edge of a control or a card
- [ ] #2 No chrome casts an offset shadow onto the picture in either theme
- [ ] #3 The picture has rounded corners where the chrome meets it, in both themes, and a presented walkthrough keeps a square picture
- [ ] #4 DESIGN.md and the app.css depth notes describe the new frame
- [ ] #5 The marketing site mock of the shell follows the new frame
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the edge-down, edge-side and edge-up shadows from app.css and their uses, so no chrome casts onto the picture.
2. Remove the one-pixel lines between chrome and picture and between stacked sections of the column and panel; trays keep their tone step.
3. Add a picture-corners utility that rounds the picture's top corners against the chrome without clipping, hidden while presenting.
4. Update DESIGN.md, .impeccable/design.json and the app.css depth notes.
5. Update the site's mock window to the new frame and check both in a browser.
<!-- SECTION:PLAN:END -->
