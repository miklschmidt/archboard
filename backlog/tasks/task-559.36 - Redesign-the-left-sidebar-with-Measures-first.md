---
id: TASK-559.36
title: Redesign the left sidebar with Measures first
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T20:20:00Z'
updated_date: '2026-10-31T20:25:00Z'
labels:
  - frontend
  - design
dependencies: []
references:
  - docs/design/reader-redesign.md
  - docs/design/operator-canvas-shell.md
  - DESIGN.md
  - >-
    docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md
parent_task_id: TASK-559
priority: high
ordinal: 1008000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reviewed the left column and called the tabs sloppy and the Measures content very messy. Five tabs do not fit 320 px, so Measures wraps under a second row. A Measures row is a name, a bare number and one or two wrapped lines of counts. "Not read: no code binding" repeats on many rows and pushes the counts around. The sort select does not animate and looks unstyled, its values have no explanation, the number badges look basic, the column is too narrow for what it holds, and it shows none of the depth of the picture. The reader exists to make design cost easy to see (PRODUCT.md, ADR 0044), so Measures is judged by one question: can an architect look at it and spot where the design costs the most? The list stays counts and lists, with no score and no invented numbers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The five destinations and their counts stand on one row, and the column width is chosen from what it holds, in the one place the shell defines it
- [ ] #2 Everything that derives from the column width follows it, including LANDING_ROOM and the layout constants of the core
- [ ] #3 A Measures row has one stable structure: each count stands in its own column from row to row, and the sorted measure is plainly tied to its number
- [ ] #4 A module with no commit data shows one quiet state that does not move any count, and it still says why to a reader who asks
- [ ] #5 A row of Measures keeps what it does today: it selects its module on its picture, from the pointer and from the keyboard, and it keeps the same counts
- [ ] #6 Every dropdown of the reader is one styled popover select from the ui-kit that animates the same way, honors reduced motion and takes its durations from @archboard/timing
- [ ] #7 Each value of Sort by has a one-line plain description of what the measure counts and what it helps a reader find
- [ ] #8 The counts of the left sidebar are one number badge that belongs to the design system
- [ ] #9 The left column reads as the same object as the picture in both themes: a recessed well for the list and a raised piece for the active tab, built from tokens and static shadows
- [ ] #10 DESIGN.md and the design records describe the new width, tokens and behavior, and bun run check is green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Width: 448 px, from five tabs with three-digit counts on one row (445 px) and a table of a 184 px name, which fits 99 percent of this model's names, beside seven 30 px count columns. Change NAVIGATOR_WIDTH in shell-geometry.ts, the mirror in archboard-layout, and derive LANDING_ROOM from one Rust constant.
2. ui-kit: one popover select and menu motion from a new group in @archboard/timing, a Select.Item description, select groups, a Count badge, and an edge variant of Tabs.
3. app.css and theme: colour utilities for the slab and tray tokens, elevation for a sunk well and a low slab, the column well, the edge tab.
4. Column: Find as a well, the repository switcher as a raised key, tabs on one row, one well round each list, rows on the floor of the well, the chosen row as a raised plate with a gold front edge in place of the gold left bar.
5. Measures: a table with one row per module, seven count columns under vertical heads, a shelf that holds the sort, what the sort counts and the heads, a footnote that says what the counts cover, a quiet dash for a module that was not read, and a neutral bar for the sorted count.
6. Badges across the column: Flows, Walkthroughs, Changes, walkthrough steps, checkouts.
7. Screenshots in dark and light at 1920 by 1080, one pass of fixes, docs, tests, and bun run check.
<!-- SECTION:PLAN:END -->
