---
id: TASK-390
title: >-
  The pane sidebar opens from the pane header, keeps its layout still and moves
  with purpose
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-03 22:12'
updated_date: '2026-10-03 22:13'
labels:
  - ui
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
documentation:
  - DESIGN.md
priority: high
type: enhancement
ordinal: 679000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-10-04: after TASK-388 the sidebar is still not good enough. "The sidebar itself collapses to an awkward bar that doesn't make sense. The walkthroughs look like they fold out but don't, and the narrate button disappears when another pane is active so the content reflows. So many problems." Animate, polish and refine the sidebar totally.

TASK-388 reviewed what the two tabs say. It did not look at how the sidebar comes and goes, or at the states a person meets with two panes. Measured on a build at 1920×1080 in the dark theme, one pane and two:

- A sidebar that rests is a 29 px bar of three unlabeled icons on the pane's right edge. In every two-pane layout it takes width from the picture, and it hides the part search, so Ctrl+Shift+F does nothing there. Two controls open it in two different ways (the first icon docks it, the other two lay a panel over the picture), and one icon means fold in the panel's tab row and unfold on the rail.
- A walkthrough row starts with a right-pointing triangle, the mark of a disclosure. Pressing the row presents the walkthrough. Nothing folds out.
- The Narrate control is drawn only in the active pane and only while voice is off. Making the other pane active removes it. The row went from 62 to 44 px high and from 231 to 259 px wide, and everything under it moved up 18 px.
- A new pick keeps the panel's scroll position, so the title of what was picked can be out of sight.
- Nothing eases. The panel arrives and leaves at once, the picture jumps to its new width, and a press, a copy and a trace answer without a transition.

DESIGN.md says nothing over the picture is animated, because every repaint over the picture slows a drag. The motion here is a single transform and opacity change of the panel's own layer, once, and a width ease that the board waits out, as the conversation's slide does. DESIGN.md is revised to say that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A sidebar that is away takes no width and draws no bar. One control in the pane header shows and hides it, says whether it is shown and what it will do, and works in every state of the pane. Nothing else shows or hides the sidebar: the rail, its tab icons and the fold control in the panel's tab row are gone.
- [ ] #2 Showing the sidebar puts it back where the person had it. A docked sidebar that was hidden docks again. A sidebar that rests, as with two panes, floats over the picture's edge until it is pinned. A pick still floats it and letting go still puts it away. A float the person opened stays until they put it away, or press Escape inside it, which returns focus to the header control.
- [ ] #3 The docked sidebar eases its width and the picture is fitted once at the end, as with the conversation. A floating panel arrives from its edge and leaves faster than it came. Both are interruptible, honor reduced motion, and move only the panel's transform and opacity or the column's width. The durations are in src/shared/timing/timing.ts. A new subject opens at the top of its panel and arrives with a short fade.
- [ ] #4 A walkthrough row does not look foldable: its mark says play, and nothing in the row points like a disclosure.
- [ ] #5 The Narrate control is in every walkthrough row of every pane, whichever pane is active and whether voice runs, and the row never changes size or position. When narration cannot start it is dimmed and says why. Pressing it in a pane that is not active makes that pane active and narrates that pane's walkthrough, by pointer or keyboard.
- [ ] #6 Ctrl+Shift+F works while the sidebar is away: it shows the panel and focuses the part search in the active pane.
- [ ] #7 Every control of both tabs, the tab row and the header control has a default, hover, focus, pressed and, where it can be, disabled state in both themes, with the focus ring never clipped. The layout engine control, the scrollbars and the numerals follow the design system.
- [ ] #8 Seen in a browser at 1920×1080 in both themes: one pane docked, one pane hidden, one pane floating, two panes with a pick, the walkthrough rows in the active and the other pane, and the part search by shortcut. A motion recording or frame sequence shows the dock and the float easing.
- [ ] #9 An independent reviewer drives every state in a browser and every finding is fixed or answered in the task. The touched files have no lint or type finding, the new contracts have module tests, and every lane that passes on a clean HEAD still passes.
- [ ] #10 docs/design/operator-canvas-shell.md, DESIGN.md and the sidebar capture in docs/design/assets describe the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Motion thesis. Focal moment: the sidebar arriving and leaving, in the one way each placement allows. A docked column eases its width and the board is fitted once at the end, as the conversation's slide does (AGENT_PANEL_SLIDE_MS, BOARD_RESIZE_SETTLE_MS). A floating panel arrives from the pane's right edge by transform and opacity, and leaves faster. Continuity: show and hide, float and dock, a new subject in the panel. Feedback: hover and press of rows and controls, copy, trace, narrate. Budget: nothing loops, each change runs once for at most 220 ms, no filter or blur, the panel's shadow stays still. DESIGN.md's Still Shadow Rule is revised to allow exactly that.

1. State model (use-sidebar.ts). Placement stays the person's: pinned (chosen, else docked when alone), away (a docked sidebar put away, so it docks again when asked for), floatBy (a pick or the person). Derived: docked, floating, shown. Actions: open(tab), toggle, pin, putAway. The rail, collapsed and collapse go.
2. Frame (SemanticSidebar.tsx). One panel element held at the pane's right edge, 280 px wide, whatever the placement. The aside's width eases from 0 to 280 when docked, so the panel never reflows. Floating is the same panel laid over the picture with the float shadow and a transform and opacity entrance (@starting-style). Mounted while shown and while it slides out, and not at all while away, so there is no empty landmark. Tab row: the tabs, the clear control right after Selection, the pin while floating. Escape inside a float puts it away and returns focus to the header control.
3. Header control (PaneHeader.tsx). One toggle after the separator: a layout-right icon filled while shown, aria-expanded and aria-controls, a tooltip that says what it will do. PaneChrome gains active, so the frame knows whether its pane is the active pane.
4. Search. Ctrl+Shift+F while the sidebar is away shows the panel and focuses the field (a request the frame hands PartSearch on mount). PartSearch loses its lint findings, because the file is touched.
5. Walkthrough rows (SemanticWalkthroughBar.tsx). A play-circle mark in place of the triangle. Narrate is always drawn in a fixed slot. onNarrate keeps meaning offered, and narrateHeld says why it cannot start now (aria-disabled, never disabled, so a press cannot fall through to the row). The shell: useNarration is no longer null for an inactive pane or while voice runs, it says whether voice is idle, and start(paneId, walkthrough) makes the pane active before it narrates, by an effect, so the keyboard works too.
6. Content. The selection panel is keyed by its subject, so it opens at the top and fades in. Hover, press and copy answer with a short colour or scale change, never transition-all. The layout engine uses the shared Select. Themed scrollbars on the sidebar's scroll areas. Numerals tabular. The focus ring is checked where a row meets the panel's edge.
7. Timing. A new src/shared/timing/lib/sidebar-motion.ts, re-exported by timing.ts, with what each duration pulls against. The stylesheet reads them as custom properties set from those constants. Reduced motion keeps the colour and opacity answers and drops the movement.
8. Tests. The state model (hide and show return to the placement, a pick floats and release puts away, a person's float stays, Escape), the header control, Narrate present in every pane and held while voice runs, a press in the inactive pane activates it and narrates, the search shortcut while away, scroll reset by subject. Update the tests that used the rail and the fold control.
9. Docs. DESIGN.md (Layout, the Still Shadow Rule, the sidebar), operator-canvas-shell.md (the pane sidebar), and the sidebar capture.
10. Verify. Type-check, lint on the touched files, the canvas, UI and modules lanes, the browser owners that read the sidebar, and headless captures in both themes of every state in the criteria, with a frame sequence of the dock and the float.
11. Review. After the build is verified, an independent reviewer drives every state in a browser and reports. Each finding is fixed or answered here.
No board proposal: the task changes how existing sidebar parts look and move, adds a control to an existing header and a field to the pane chrome, and adds no module, dependency or relationship that a board draws.
<!-- SECTION:PLAN:END -->
