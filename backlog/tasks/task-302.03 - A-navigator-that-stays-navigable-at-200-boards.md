---
id: TASK-302.03
title: A navigator that stays navigable at 200 boards
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
updated_date: '2026-09-23 04:59'
labels: []
dependencies:
  - TASK-302.01
parent_task_id: TASK-302
priority: high
ordinal: 525000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The navigator lists every board A-Z with at least two rows each (board, then a repeated variant row), no search, all expanded, activity only on variant rows, and a BOARDS eyebrow. At 14 boards it already scrolls; at 200 it is unusable. The redesign derives an outline from folders, the drill hierarchy and names, lists each board once, shows variant states only for the board being read, filters in place, and gathers live agent work into one block that never reflows the tree.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each board appears on exactly one row of fixed height; the outline nests boards under folders and under their primary drill parent, and siblings sort by name; activity never reorders or resizes rows
- [ ] #2 A row shows the board name, its level as a muted word, which panes show it, whether an agent works on it, and how many other states it has
- [ ] #3 The variant ancestry of the board in the active pane is listed under its row, and any other board's states open from its row; choosing one opens it
- [ ] #4 A filter reachable by / and Ctrl+K narrows the outline in place in tree order by name, folder, variant and description, with a count and a clear control
- [ ] #5 Enter or a click opens into the active pane and Alt+Enter or Alt+click into the other pane (adding pane B when there is one pane), each as the person's own move (ADR 0034)
- [ ] #6 Boards an agent is claiming or recently wrote are gathered in a working-now block with the latest doing line and its age, absent when nothing is live
- [ ] #7 Loading, empty, unreadable-listing and offline states are drawn; there are no eyebrows
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derive an outline from the listing (TASK-302.01): folders from '/' in names, then the primary drill parent (a container's up link, else the coarsest board linking down, same folder only), cycles broken, siblings folders-first then numeric-aware name order (src/ui/board-catalog/lib/outline.ts).
2. Flatten the outline into rows with expansion, states of a board (drafts nested by ancestry), filter mode and ARIA positions (src/ui/shell/lib/navigator-rows.ts); fold diacritics and case for matching.
3. Render the navigator as an ARIA tree with roving focus, type-ahead into the filter, arrow/Enter/Alt keys, Alt-click beside; the filter row with Ctrl K and '/', count and clear; Working now at the foot; loading, empty, error and no-match states.
4. Open beside through a shell action that adds pane B and selects once it registers.
5. Header breadcrumb from the outline (ancestors, board, level, shown state, not built); pane tabs only with two panes.
6. Verify with unit tests (outline, navigator tree) and the browser lane (workspace-address, shell-layout), plus rendered captures on the work and dogfood vaults.
<!-- SECTION:PLAN:END -->
