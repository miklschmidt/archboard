---
id: TASK-475
title: >-
  One About page replaces the pane's Parts, Relationships, Variants and
  Walkthroughs pages
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 11:32'
updated_date: '2026-10-15 11:49'
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
- [ ] #1 The pane header has two tabs, Diagram and About. About lays one scrolling page over the picture in place of the four pages, and the Parts, Relationships, Variants and Walkthroughs tabs are gone.
- [ ] #2 The page opens with the board's name, its level, the variant on screen with its lifecycle and record, and the variant's summary.
- [ ] #3 The walkthrough section shows every walkthrough of the variant with its summary, and for each step its number, heading, words, view and the subjects it focuses. A step that names no view says it is shown in the view on screen. A step presents its walkthrough from there, and a walkthrough can be presented or narrated from its head.
- [ ] #4 The parts section lists every part of the variant in its containment, with its kind, responsibility, groups and the board it opens. The relationships section lists every relationship with its two ends, what it carries and its kind. Choosing a row picks the subject in the pane, and a control on the row shows it on the diagram.
- [ ] #5 The variants section lists the board's variants as the Variants page did: one timeline with the record of each adoption and shelving, and choosing a variant reads it in the pane. It is there when the variant asked for is not on the board, so the reader can choose another.
- [ ] #6 An outline beside the sections lists each section with its count, goes to a section, and marks the section being read. A section with nothing to show is absent. The page works from the keyboard, in both themes, and in a pane that shares the centre.
- [ ] #7 Tests own the page's behaviour, and the shell docs, DESIGN.md and the Board viewer board describe it.
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
