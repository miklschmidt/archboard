---
id: TASK-249
title: Merge the legend and inspector into one tabbed left sidebar
status: To Do
assignee: []
created_date: '2026-09-17 08:24'
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
- [ ] #1 A semantic pane has one left sidebar with a legend tab and an inspection tab; the separate right-hand inspector is gone
- [ ] #2 Picking a subject out switches the sidebar to inspection; clearing the selection returns it to the tab that was open before
- [ ] #3 Switching tabs does not move the camera; opening or collapsing the sidebar refits the picture the way a pane resize does, until the person has panned or zoomed
- [ ] #4 Variants are chosen from the navigator only, and group inspection is reachable from the sidebar; the strip above the diagram is gone
- [ ] #5 Views have a single home decided and recorded in the task, reachable by keyboard
- [ ] #6 The sidebar collapses to its tab icons, and keyboard focus, Escape and reduced motion behave as they do today
- [ ] #7 operator-canvas-shell.md and its reference image describe the new layout, and rendered browser owners cover tab switching, auto-switch on selection and the refit
<!-- AC:END -->
