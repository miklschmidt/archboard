---
id: TASK-475
title: >-
  One About page replaces the pane's Parts, Relationships, Variants and
  Walkthroughs pages
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 11:32'
updated_date: '2026-10-15 14:50'
labels: []
dependencies: []
ordinal: 817000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pane's header has five tabs: Diagram and four pages that each list one kind of thing a board holds. A reader who wants to learn a board moves between four pages, and none of them says how the things relate: the Parts page is a flat grid that drops containment, and the Walkthroughs page lists only each step's heading, so nobody can read what a step says, which view it uses or what it shows without presenting it. The owner asked on 2026-10-15 for the four pages to become one page for reading and discovering a board, which leaves two tabs. It is designed for 1920x1080 and may scroll. The page is a reading, like the pages it replaces: it writes nothing to a board (ADR 0023).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pane header has two tabs, Diagram and About. About lays one scrolling page over the picture in place of the four pages, and the Parts, Relationships, Variants and Walkthroughs tabs are gone.
- [x] #2 The page opens with the board's name, its level, the variant on screen with its lifecycle and record, and the variant's summary.
- [x] #3 The walkthrough section shows every walkthrough of the variant with its summary, and for each step its number, heading, words, view and the subjects it focuses. A step that names no view says it is shown in the view on screen. A step presents its walkthrough from there, and a walkthrough can be presented or narrated from its head.
- [x] #4 The parts section lists every part of the variant in its containment, with its kind, responsibility, groups and the board it opens. The relationships section lists every relationship with its two ends, what it carries and its kind. Choosing a row picks the subject in the pane, and a control on the row shows it on the diagram.
- [x] #5 The variants section lists the board's variants as the Variants page did: one timeline with the record of each adoption and shelving, and choosing a variant reads it in the pane. It is there when the variant asked for is not on the board, so the reader can choose another.
- [x] #6 An outline beside the sections lists each section with its count, goes to a section, and marks the section being read. A section with nothing to show is absent. The page works from the keyboard, in both themes, and in a pane that shares the centre.
- [x] #7 Tests own the page's behaviour, and the shell docs, DESIGN.md and the Board viewer board describe it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board affected: Board viewer. Proposal Board viewer@TASK-475 restates Render stage states (3KqRuOEN: the header's two tabs and the About page in place of the four pages) and moves the anchor of wQBlFEQ3 (variantTimeline) to the file that now draws the timeline. No other board draws the pane's pages.
2. PaneHeader: BoardTab becomes diagram | about, TABS lists Diagram and About, and the tabs carry no counts (PaneHeaderProps.counts and headerFacts' counts go). use-stage-tab and CodeWarnings keep their contracts with the narrower type.
3. The About page, in components/: AboutPage.tsx lays the page over the picture (title block with name, level, variant, lifecycle, record and summary; a sticky outline with each section's count that goes to a section and marks the one being read; the busy state; a missing variant that keeps the variants section). AboutWalkthroughs.tsx draws each walkthrough as a script: its head presents or narrates it, and each step shows its number, heading, words, view (or the view on screen) and the subjects it focuses, which pick, and presents from there. AboutParts.tsx draws the parts in their containment with kind, responsibility, groups and the board each opens, and the relationships with both ends, what each carries and its kind; a row picks, and a control shows it on the diagram. AboutVariants.tsx takes the timeline from BoardHistoryPages.tsx. hooks/use-section-spy.ts reads which section is being read from the page's scroll. BoardPage.tsx and BoardHistoryPages.tsx go.
4. SemanticStageView hands the page the reading, the narration, the pick, the tab and the walkthrough reads.
5. Tests: the variants helper opens the About tab; the variants and levels tests read the page by its new tab; the shell matrix samples the mono face from the navigator's shortcut key; a new semantic-board-about test owns the step listing (view or view on screen, subjects), presenting from a step, the containment order, picking and showing on the diagram, and absent empty sections.
6. Docs: operator-canvas-shell.md, DESIGN.md (the About page, the page card), .impeccable/design.json, pane-sidebar-hierarchy.md, and the comments that name the old pages.
7. Look at it at 1920x1080 in both themes, in one pane and in two, and from the keyboard.
8. Review step: reviewer agents on the page components, on the header, stage wiring and tests, and on the boundary between them; they commit their fixes.
9. Close: bun run check, code check against the proposal, footprint, adopt, dogfood check, readme:check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebase: the branch was first cut from origin/main, and it was rebased onto main 8bbb63584. Main changed two things that the page reads. TASK-472.05 gave the level mark the vault whose policy names its icon, so the page marks the board on screen with the pane's vault, as the pane header does. TASK-472.12 lets a drill-down name a board of another repository. The Opens cell gives such a board the plain mark, because only opening that board finds its vault, and it names the repository under the board. 5b16022f0 adds the test that owns the Opens cell, which no test read before. Main's TASK-472.13 had changed the Board viewer board, so the proposal was drawn again from its current variant d66pQWDQ, with the same two changes.

Review step: four reviewer agents covered the page components, the header with the stage wiring and tests, the documents, and the boundary between page and stage. Their commits: 9be495160 (the design text held to the code), 643356619 (a code warning shows its subject through the stage's one onShow), 5b53b887c (long words wrap, and the narrow outline bar scrolls sideways), 8bcaa1c81 (the relationship chip's unused plate goes), 6ab2ca28c (a test for a board with no such variant) and fba91b847 (the camera fit runs after the pick's own camera moves). The parent fixed what they left open in c3cebce99. The page keeps its place on each board, where before it came back at its top after a presentation or the diagram. A pick's float waits while the About page is open, where before in two panes it covered the page's controls. 5d2063f2b and 55a3af1da fix the last stale comment and a docs line.

Not reproduced: one reviewer saw the pane header's breadcrumb drawn over itself in 439 px panes. At 439 px, with two panes beside the navigator, both headers fold cleanly here.

Looked at on the rebased build at 1920x1080: one pane in the light and the dark theme, and two panes that share the centre, each with its About page open.

Gate: bun run check passed in full on 6aa9accce, with both proposals adopted (lint, format, types, 4714 module tests with 1 skipped, 240 system tests, 27 repository tests, 19 browser files). wide-boards.test.ts, the one test that lays out the dogfood boards, read the adopted boards there.

Code check: with --variant TASK-475 no finding is added, and the proposal clears the ANCHOR_PATH_MISSING of wQBlFEQ3, which cited the deleted BoardHistoryPages.tsx. The anchor now cites AboutPage.tsx, which calls variantTimeline. The EXPOSED_UNUSED on Semantic viewer is in both runs, and the module's root exports did not change.

Footprint against base d7c28961b, the plan commit before c3bb533c7, which is the first commit with Refs: TASK-475. Current is TASK-472.13, the parent of the proposal. Named and changed: Render stage states and Viewer entry point. Changed but not named: Semantic viewer is the directory container. Inside it, the commits changed hooks and lib files that have no part of their own (use-stage-tab.ts, use-sidebar.ts, use-subject-focus.ts, use-section-spy.ts, kind-look.ts, timeline.ts) and tests, and the restated Viewer entry point and Render stage states say what they now do. Local pictures changed only in a comment of c3bb533c7 that names the About page. c3bb533c7 reads as large because it carries the feature's docs, images and tests, and it is not a sweep. Named but not changed: none. 5b16022f0 came after the footprint, and it changes only a test inside Semantic viewer.

Adopted Board viewer@TASK-475 at version 103, and archboard check reports no diagnostics. Behind: no commit of this task puts another board behind.

README: bun run readme:check lists all 16 assets as stale, and a checkout of main 8bbb63584 lists the same 16, so this task made none of them stale. The clips film the real shell, so a refresh shows the new header, and a person attaches them by hand. ask, explainer, pr-walkthrough and newcomer also need a Codex sign-in.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pane's header now has two tabs, Diagram and About, in place of five. The About page lies over the picture and scrolls. It opens with the board's name, its level, the variant on screen with where it stands, and the variant's summary. An outline lists each section with its count, goes to a section and marks the one being read. The walkthroughs are scripts that show each step's number, heading, words, view (or the view on screen) and subjects, and present from any step. The parts stand in their containment with the board each opens, and with its repository when that board is in another one. The relationships are a table, and the variants keep their timeline. A row picks its subject, and its control shows it on the diagram through the stage's one show, which the code warnings use too. The page keeps its place on each board, and in two panes a pick on it lays no panel over it. Verified by semantic-board-about.test.tsx, the sidebar placement, variants and levels tests, browser checks at 1920x1080 in one and two panes and in both themes, four reviewers, and a full bun run check on the branch rebased onto main. The shell docs, DESIGN.md and Board viewer@TASK-475, now adopted, describe it.
<!-- SECTION:FINAL_SUMMARY:END -->
