---
id: TASK-604
title: >-
  Calmer shell frame: fewer section lines, no cast shadow, rounded canvas
  corners
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T13:12:00Z'
updated_date: '2026-11-08T15:43:00Z'
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
- [x] #1 Sections inside the left column and the right panel are parted by space or tone, not by one-pixel lines, except where a line draws the edge of a control or a card
- [x] #2 No chrome casts an offset shadow onto the picture in either theme
- [x] #3 The picture has rounded corners where the chrome meets it, in both themes, and a presented walkthrough keeps a square picture
- [x] #4 DESIGN.md and the app.css depth notes describe the new frame
- [x] #5 The marketing site mock of the shell follows the new frame
- [x] #6 The chrome holds the picture on every side with a strip about as wide as the column margin, and no line draws the picture edge
- [x] #7 One pane draws no focus frame round its picture; with two panes the active pane's picture carries a quiet neutral edge along its rounded corners, never gold
- [x] #8 The About page is framed by the chrome as the picture is, with four rounded corners
- [x] #9 The agent's card lies in the left column's well with the tray tone, its lit top edge and rising shadow, and holds Working now at its top
- [x] #10 A claim stands as a card at the top centre of the picture, moves nothing, and names every subject without a count
- [x] #11 The navigator marks only the open module, the flow on screen or the walkthrough playing; a selection on the picture marks no row
- [x] #12 The right panel's subject block and foot share one grid and rhythm, its kind chip aligns with the top of the heading, and the heading takes the site's setting
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the edge-down, edge-side and edge-up shadows from app.css and their uses, so no chrome casts onto the picture.
2. Remove the one-pixel lines between chrome and picture and between stacked sections of the column and panel; trays keep their tone step.
3. Add a picture-corners utility that rounds the picture's top corners against the chrome without clipping, hidden while presenting.
4. Update DESIGN.md, .impeccable/design.json and the app.css depth notes.
5. Update the site's mock window to the new frame and check both in a browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in the running app (port 4467) at 1440x900 in both themes: chrome strip and rounded corners round the picture and About; no focus frame with one pane, quiet neutral edge on the active pane with two; agent card in the well with Working now; claim card at the top centre naming Checkout API, Orders DB; tree marks only Checkout API while Place order is selected; right panel head and foot. Full gate: every lane passes; the browser lane passes 49 of 49 files after the reconciliation owner scrolls the blocked ancestor into view.

Review of a2af63695..cd031b68f found that a lost event connection hides an active claim. Keep cached claims mounted until ownership changes, and extend the existing reconnect owner. The Browser module vKEsyHFk/vKEsyHFk#6nZjwK9W keeps its existing reader, Query, and event ownership. These presentation fixes change no architecture contract, so no proposal is needed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The shell is one flat chrome plane that frames the picture and the About page on every side, with an 8px strip and 12px rounded corners, no cast shadow and no hairline. The left column's well runs to its foot, and the agent's card lies in it with the tray tone and depth, holding Working now. One pane draws no focus frame; two panes mark the active picture with a quiet neutral edge. A claim is a card at the top centre of the picture that names its subjects. The module tree marks only where the reader is. The right panel's subject block and foot are polished onto one grid. DESIGN.md, the depth notes and the marketing site's mock follow. Follow-up: refresh the README assets once the UI polish settles; they still show the old frame and the old claim banner.
<!-- SECTION:FINAL_SUMMARY:END -->
