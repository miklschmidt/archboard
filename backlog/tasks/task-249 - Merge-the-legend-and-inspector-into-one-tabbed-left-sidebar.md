---
id: TASK-249
title: Merge the legend and inspector into one tabbed left sidebar
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 08:24'
updated_date: '2026-09-17 08:44'
labels:
  - frontend
  - ux
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
ordinal: 436000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The strip above a semantic diagram mixes four things that do not belong there: the board's variants, which the navigator already lists under every board (two places for one choice at the same time), the shared views, the walkthroughs and group inspection. Beside the diagram the legend sits on the left and takes part in layout, so the camera refits around it, while the inspector opens on the right and does not, so a selection can land under it. The user asked on 2026-09-17 to merge the legend and inspector into one tabbed left sidebar that switches to inspection when something is picked out. Walkthroughs are deliberately not part of this sidebar: they become a presentation mode of their own (see the presentation task). Open decision for whoever picks this up: whether views belong in the sidebar or in a small switcher on the pane itself, since a view changes what is drawn rather than what is lit. The strip currently keeps a fixed 49 px height only so the pane does not jump while its contents load (TASK-248); removing the strip removes that constraint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A semantic pane has one left sidebar with a legend tab and an inspection tab; the separate right-hand inspector is gone
- [x] #2 Picking a subject out switches the sidebar to inspection; clearing the selection returns it to the tab that was open before
- [x] #3 Switching tabs does not move the camera; opening or collapsing the sidebar refits the picture the way a pane resize does, until the person has panned or zoomed
- [x] #4 Variants are chosen from the navigator only, and group inspection is reachable from the sidebar; the strip above the diagram is gone
- [x] #5 Views have a single home decided and recorded in the task, reachable by keyboard
- [x] #6 The sidebar collapses to its tab icons, and keyboard focus, Escape and reduced motion behave as they do today
- [x] #7 operator-canvas-shell.md and its reference image describe the new layout, and rendered browser owners cover tab switching, auto-switch on selection and the refit
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One left sidebar (SIDEBAR_WIDTH, the old inspector width, so the renderer's reference pane is unchanged) with Board and Selection tabs; the inspector and legend become its panels.
2. useSidebar: a pick opens Selection, clearing returns the previous tab, a tab chosen while selected sticks; collapse never opened by a pick.
3. Board tab holds views, walkthroughs, group inspection, level-down states and the legend; the strip above the picture and the pane's own variant choice are removed.
4. Tests: stage tests move to the navigator/sidebar, new sidebar owner; browser owners for tab switching, auto-switch and refit on collapse; design doc and a rendered reference.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Views live in the sidebar's Board tab (recorded in docs/design/operator-canvas-shell.md): one home for how a board is read, and a switcher over the picture would cover what it switches. A board a level down still offers its states there, because the navigator does not hold it. A pane presented fullscreen hides the sidebar (in-data-presenting), which the live voice owner now asserts for real. Clearing the selection moved from the inspector's own bar into the tab row.
Verified: 1000 UI tests including semantic-board-sidebar.test.tsx; serial browser lane all passing, with semantic-board-inspection asserting tab auto-switch and that collapse widens the viewport and refits, workspace-address choosing a variant through the navigator; modules lane 3173; lint, fmt, type-check. Rendered light and dark captures reviewed and kept as docs/design/assets/semantic-pane-sidebar.png.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Semantic panes have one tabbed left sidebar (Board: views, walkthroughs, groups, level-down states and the legend; Selection: the inspector) instead of a strip above the picture, a legend column and an overlaid inspector. A pick opens Selection and letting go gives back the previous tab; tabs never move the camera, collapsing refits; variants are chosen in the navigator. Verified with stage and sidebar tests, the full browser lane and the modules lane.
<!-- SECTION:FINAL_SUMMARY:END -->
