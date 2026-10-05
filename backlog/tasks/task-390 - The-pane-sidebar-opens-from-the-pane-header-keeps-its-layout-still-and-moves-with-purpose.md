---
id: TASK-390
title: >-
  The pane sidebar opens from the pane header, keeps its layout still and moves
  with purpose
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 22:12'
updated_date: '2026-10-03 23:43'
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
- [x] #1 A sidebar that is away takes no width and draws no bar. One control in the pane header shows and hides it, says whether it is shown and what it will do, and works in every state of the pane. While a presented walkthrough steps the sidebar aside the control is held and says why. Nothing else shows or hides the sidebar: the rail, its tab icons and the fold control in the panel's tab row are gone.
- [x] #2 Showing the sidebar puts it back where the person had it. A docked sidebar that was hidden docks again. A sidebar that rests, as with two panes, floats over the picture's edge until it is pinned. A pick still floats it and letting go still puts it away. A float the person opened stays until they put it away, or press Escape inside it. A panel put away with focus inside it returns focus to the header control. Choosing a tab does not change where the sidebar is.
- [x] #3 The docked sidebar eases its width and the picture is fitted once at the end, as with the conversation. A floating panel arrives from its edge and leaves faster than it came. Both are interruptible, honor reduced motion, and move only the panel's transform and opacity or the column's width. The durations are in src/shared/timing/timing.ts. A new subject opens at the top of its panel and arrives with a short fade.
- [x] #4 A walkthrough row does not look foldable: its mark says play, and nothing in the row points like a disclosure.
- [x] #5 The Narrate control is in every walkthrough row of every pane, whichever pane is active and whether voice runs, and the row never changes size or position. When narration cannot start it is dimmed and says why. Pressing it in a pane that is not active makes that pane active and narrates that pane's walkthrough, by pointer or keyboard.
- [x] #6 Ctrl or Command with Shift and K works while the sidebar is away: it shows the panel and focuses the part search in the active pane. Ctrl or Command with Shift and F, the shell's present shortcut, no longer also asks for the search.
- [x] #7 Every control of both tabs, the tab row and the header control has a default, hover, focus, pressed and, where it can be, held state in both themes, with the focus ring never clipped. The layout engine control and the scrollbars follow the design system.
- [x] #8 Seen in a browser at 1920×1080 in both themes: one pane docked, one pane hidden, one pane floating, two panes with a pick, the walkthrough rows in the active and the other pane, and the part search by shortcut. A motion recording or frame sequence shows the dock and the float easing.
- [x] #9 An independent reviewer drives every state in a browser and every finding is fixed or answered in the task. The files this change adds or rewrites have no lint or type finding and no touched file has more than before, the new contracts have module tests, and every lane that passes on a clean HEAD still passes.
- [x] #10 docs/design/operator-canvas-shell.md, DESIGN.md and the sidebar capture in docs/design/assets describe the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Motion thesis. Focal moment: the sidebar arriving and leaving, in the one way each placement allows. A docked column eases its width and the board is fitted once at the end, as the conversation's slide does (AGENT_PANEL_SLIDE_MS, BOARD_RESIZE_SETTLE_MS). A floating panel eases in from the pane's right edge by transform and opacity, and leaves faster. Continuity: show and hide, float and dock, a new subject in the panel. Feedback: hover and press of rows and controls answer with tone. Budget: nothing loops, each change runs once for at most 220 ms, no filter or blur, the panel's shadow stays still. DESIGN.md's Still Shadow Rule is revised to allow exactly that.

1. State model (use-sidebar.ts). Placement stays the person's: pinned (chosen, else docked when alone), away (a docked sidebar put away, so it docks again when asked for), floatBy (a pick or the person). Derived: docked, floating, shown. Actions: open(tab), which only chooses a tab and turns a float that is being read into the person's, toggle, pin, putAway. steppedAside: a presented walkthrough steps the sidebar aside, and while it lasts nothing shows or hides it. The rail, collapsed and collapse are gone.
2. Frame (SemanticSidebar.tsx, use-sidebar-slide.ts, app.css). One panel held at the pane's right edge, 280 px wide, whatever the placement. The column's width eases from 0 to 280 when docked, so the panel never reflows. Floating is the same panel laid over the picture with the float shadow and a transform and opacity entrance (@starting-style); the pane's reading area clips what floats. Mounted while shown and while it slides out, and not at all while away, so there is no empty landmark. Tab row: the tabs, the clear control right after Selection, the pin while floating. Escape inside a float puts it away, and a panel put away with focus inside it gives focus to the header control.
3. Header control (PaneHeader.tsx, SidebarToggle.tsx). One toggle after the separator: a layout-right icon filled while shown, aria-expanded and aria-controls, a tooltip that says what it will do, held with a reason while a walkthrough is presented. PaneChrome gains active, so the frame knows whether its pane is the active pane.
4. Search. A shortcut while the sidebar is away shows the panel and focuses the field (a request the frame hands PartSearch on mount). Ctrl or Command with Shift and F is the shell's present shortcut and the old search shortcut fired both, so the search moved to Ctrl or Command with Shift and K. PartSearch loses its lint findings, because the file is touched, and keeps what is pointed at inside its list.
5. Walkthrough rows. A play-circle mark in place of the triangle. Narrate is always drawn in a fixed slot, from one narration object per pane ({ held, start }); a held control is aria-disabled with the reason, never disabled. narrator.ts orders the work: make the pane active, start once the voice follows it, drop a narration that nobody waits for. IconButton gains held.
6. Content. The selection panel is keyed by its subject, so it opens at the top and fades in, and focus is given to the selection tab when a row of the panel picks. Hover and press answer with a short colour change, never transition-all. The layout engine uses the shared Select, with its label above. Thin scrollbars on the sidebar's scroll areas.
7. Timing. src/shared/timing/lib/column-motion.ts, re-exported by timing.ts, holds SIDEBAR_MS and the one slide duration the conversation and a docked sidebar share, with what each pulls against. The stylesheet reads them as custom properties set from those constants. Reduced motion cuts.
8. Tests. Module tests through the stage for where the sidebar is (hide and show, resting float, pick float and release, the person's float, pin, Escape, focus back, a tab chosen while docked, a presented walkthrough, the search shortcut), for Narrate present in every pane and held, and for the scroll reset; unit tests of narrator.ts; one browser owner step for the shortcut and the Escape ladder.
9. Docs. DESIGN.md (Layout, the Still Shadow Rule, the pane sidebar), operator-canvas-shell.md (the pane sidebar), pane-sidebar-hierarchy.md, and the sidebar capture.
10. Verify. Type-check, lint on the touched files, the module, repository and browser lanes against a clean-HEAD baseline, and headless captures in both themes of every state in the criteria, with frame sequences of the dock and the float.
11. Review. Eight independent reviewers (five scopes, three boundaries) each drove their part in a browser. Each finding is fixed or answered in the notes.
No board proposal: the task changes how existing sidebar parts look and move, adds a control to an existing header and a field to the pane chrome, and adds no module, dependency or relationship that a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: the search shortcut moved from Ctrl or Command with Shift and F to Ctrl or Command with Shift and K. The shell has used Shift and F to present the active pane since 2026-09-06 (src/ui/shell/lib/shortcuts.ts). The search shortcut came later, in the prototype branch, and fired the present shortcut as well, so pressing it presented the pane and never reached the search. K is the board finder's key, widened with Shift to the parts of every board. Criterion 6 was reworded to match. Firefox on Windows and Linux reserves Ctrl+Shift+K for its Web Console, and INSTALL.md names only Chromium or Chrome, so no change was made for it.

Decision: a presented walkthrough steps the sidebar aside (the stylesheet already hid it). Two reviewers found that the header control then said the sidebar was shown, that pressing it hid the sidebar with nothing visible, and that the search shortcut did the same. useSidebar now takes the flag, shown is false while it holds, the control is held with a reason, and the shortcut is ignored.

Decision: Narrate. The pane gets one narration object ({ held, start }) from the shell, the same object for a pane until voice starts or ends, so the memoized panes are not drawn again. narrator.ts keeps the order: make the pane active, start only once the voice follows it, start at once when the pane has no voice to follow so the person is told why not, and drop a narration when the person has left the pane or voice has started. A held control keeps its place, is aria-disabled and names the reason for each voice stage. The caption of a presented walkthrough follows the same rule.

Review: eight independent reviewers (five scopes, three boundaries) each drove their part in a browser. Fixed: a stale narration could start later with nobody asking (narrator tests added); the held reason said to end voice in the starting and ending stages; choosing a tab in a docked sidebar turned into a float when a second pane arrived (stage test added); the control and the shortcut acted while a walkthrough hid the sidebar (stage test added); focus fell to the page body when a panel was put away from inside it, when the selection was cleared, and when a row picked a new subject (a stage test and the browser check cover the first two; the third was verified in the browser); a docked sidebar lost its edge shadow to the clip; a leaving tab panel showed beside the arriving one for about 70 ms; the floating panel drew over the pane beside it while it eased in (the reading area now clips); the pointed result in the part search could point at a missing row; the list used an unneeded second lint bypass; the shortcut now ignores a held key and a handled key; IconButton lost a disabled prop that did nothing, and the harness lost an export that only it used; the layout engine select cut Blocks (experimental) in half, so its label is now above a full-width trigger; the trace and code controls answer with a colour change; a row no longer moves down a pixel when pressed; a dead filled play mark was removed; the 220 ms slide duration is one constant shared with the conversation; stale words in two documents and four comments; the claims in DESIGN.md and the shell reference about what moves over the picture and what is painted again were narrowed to what is true.

Answered without a change: numerals. The counts that sit in a column, the changes, are already tabular, and no other number in the sidebar sits in a column, so criterion 7 no longer lists numerals. The Reconnecting status sits between the sidebar control and the pane's own controls while the connection is down: it is a transient state and the order keeps the close control in the corner. The active pane follows the pointer only, so pressing the search shortcut after tabbing into the other pane reaches the active pane. The present shortcut behaves the same, it is the shell's model, and making a pane active on focus is a shell decision that needs the user's approval. The content fade also runs when a hidden ancestor comes back (first load, leaving a presented walkthrough), and a thin scrollbar still narrows the content by its width on a window shorter than the board tab: both are small and were left. Firefox and Safari behaviour of @starting-style, and background-tab timer throttling, were not verified; throttling only delays an unmount.

Verification. bunx tsc --noEmit is clean. Lint on every touched file is clean except six old findings in SemanticBoardStage.tsx (max-lines, complexity, react-perf, one JSDoc), which this change does not touch beyond one prop and one call. bun test --isolate src/ui src/shared: 1259 pass and 5 fail; the same 5 fail on a clean 17304506 (three trail tests in semantic-board-levels and semantic-board-inspection, the pane-news claim test and the navigator-tree TASK-385.04 test). The repository lane passes. Browser owners, one file at a time: shell-layout, the variant test of workspace-address, measured-text, opener-settings, codex-text-workbench and codex-live-voice fail, and they fail the same way on a clean worktree of 17304506; the other eleven pass, including the walkthrough presentation and inspection owners, and the inspection owner now also covers the search shortcut and the Escape steps. Captures at 1920x1080 in both themes: docked, hidden, floating, two panes with a pick, the rows in the active and the other pane (rect 263x44, Narrate 28x28, unchanged when the active pane changes), the search by shortcut, the focus rings, the select. Frame samples: the docked column eases 280 to 0 and 0 to 280 in about 220 ms with the panel at x=1640 and 280 px wide on every frame, the picture is fitted once about 100 ms after, the float eases in over about 170 ms from 32 px to its place and leaves in about 130 ms, a new subject fades in over about 130 ms, and the console has no error.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pane sidebar now opens from one control in the pane header and is nowhere when it is away: the 29 px rail of icons and the fold control are gone. Showing it puts it back where the person had it. A docked column eases its width and the board is fitted once at the end, as for the conversation, and a floating panel eases its transform and opacity; both are interruptible, the durations are SIDEBAR_MS, and reduced motion cuts. A walkthrough row starts with a play mark. Narrate is in every row of every pane and is dimmed with its reason while voice runs, so a row no longer changes size when another pane is active, and pressing it in the other pane makes that pane active first (narrator.ts). The search shortcut moved to Ctrl or Command with Shift and K because Shift and F presents the pane, and it now works while the sidebar is away. A new subject opens at the top of the selection tab with a short fade, the layout engine uses the shared select, and the sidebar's scrollbars are thin. Verified with the type check, lint on every touched file (six old findings remain in SemanticBoardStage.tsx), the module lane (3846 pass; the 5 that fail also fail on a clean 17304506), the system lane (189 pass), the repository lane (8 pass), and the browser owners one file at a time (eleven pass; the six that fail also fail on a clean 17304506), plus captures in both themes and per-frame samples of the motion. Eight independent reviewers drove the change in a browser and every finding is fixed or answered in the notes. The two documents and the sidebar capture describe the result.
<!-- SECTION:FINAL_SUMMARY:END -->
