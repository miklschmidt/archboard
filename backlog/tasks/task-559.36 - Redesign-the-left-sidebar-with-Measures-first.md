---
id: TASK-559.36
title: Redesign the left sidebar with Measures first
status: Done
assignee:
  - '@claude'
created_date: '2026-10-31T20:20:00Z'
updated_date: '2026-10-31T20:56:00Z'
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
- [x] #1 The five destinations and their counts stand on one row, and the column width is chosen from what it holds, in the one place the shell defines it
- [x] #2 Everything that derives from the column width follows it, including LANDING_ROOM and the layout constants of the core
- [x] #3 A Measures row has one stable structure: each count stands in its own column from row to row, and the sorted measure is plainly tied to its number
- [x] #4 A module with no commit data shows one quiet state that does not move any count, and it still says why to a reader who asks
- [x] #5 A row of Measures keeps what it does today: it selects its module on its picture, from the pointer and from the keyboard, and it keeps the same counts
- [x] #6 Every dropdown of the reader is one styled popover select from the ui-kit that animates the same way, honors reduced motion and takes its durations from @archboard/timing
- [x] #7 Each value of Sort by has a one-line plain description of what the measure counts and what it helps a reader find
- [x] #8 The counts of the left sidebar are one number badge that belongs to the design system
- [x] #9 The left column reads as the same object as the picture in both themes: a recessed well for the list and a raised piece for the active tab, built from tokens and static shadows
- [x] #10 DESIGN.md and the design records describe the new width, tokens and behavior, and bun run check is green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Width: 448 px, from five tabs with three-digit counts on one row (445 px) and a table of a 184 px name, which fits 99 percent of this model's names, beside seven 30 px columns. NAVIGATOR_WIDTH holds it, and the core derives LANDING_ROOM from the same width.
2. ui-kit: one popover select and menu motion, with popoverIn and popoverOut in COLUMN_MS of @archboard/timing, which apps/web puts on the root because the kit cannot read timing. A Select.Item description, select groups, a count variant of Badge, and an edge variant of Tabs.
3. app.css and theme: colour utilities for the slab and tray tokens, elevation for a sunk well and a low slab, the column well, the edge tab.
4. Column: Find as a well, the repository switcher as a raised key, tabs on one row, one well round each list, rows on the floor of the well, the chosen row as a raised plate with a gold foot.
5. Measures: a table with one row per module, seven count columns under vertical heads, a shelf that holds the sort, what the sort counts and the heads, a foot that says what the counts cover and why modules were not read, the sorted count on a slab and a neutral bar under the name.
6. Badges across the column: Flows, Walkthroughs, Changes, walkthrough steps, checkouts.
7. Screenshots in dark and light at 1920 by 1080, one pass of fixes, docs, tests, and bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Width 448 px: five tabs with three-digit counts need 445 px on one row, and the table needs a 184 px name beside seven 30 px columns. The column measures 448 px at 1920 by 1080 with one tab row. LANDING_ROOM is now (1063, 955), derived from NAVIGATOR_WIDTH in the core, and the stage is 1471 with a reference pane of 1143. LANDS_WHOLE stays at (2505, 1520): it is a limit on the absolute size of a drawing in the ranking, not a function of the room.
Browser evidence on this repository's model (477 of 544 modules read, 67 with no code binding): one dash per history cell (134 dashes), 477 sorted slabs and 356 bars. Enter on a focused row selects the module on its picture. With reduced motion emulated, the open popover reads a transition of 1e-06 s through the global rule in app.css. A closed select has zero height. No native select remains in apps/web or the ui-kit.
Base UI puts an inline transition of none on a popover during its starting frame, so tests/system/browser/reader-measures.test.ts polls for the duration from COLUMN_MS. No model change: the work adds no module and no relationship.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The left column is now the same object as the picture. It is 448 px wide, chosen from what it holds, so the five destinations stand on one row. NAVIGATOR_WIDTH and the core constants share that width, and LANDING_ROOM derives from it. Measures is a table: seven count columns in stable places, vertical heads, the sorted count on a slab and a neutral bar under the name, one quiet dash for a module the read skipped, and a foot that says once what the counts cover. Every dropdown is one ui-kit popover with one motion, durations in COLUMN_MS and reduced motion honored. Each Sort by value has a one-line description. Counts across the column use the count variant of Badge. The list lies in a well with an edge tab on it, in both themes. DESIGN.md, the design records, ADR 0043 and the frontend guide describe the new width, tokens and behavior. Verified in the browser at 1920 by 1080 in dark and light, by unit tests and by bun run check. A picture now lands in a narrower room of 1063 by 955, and README diagrams and other recorded fits predate that room.
<!-- SECTION:FINAL_SUMMARY:END -->
