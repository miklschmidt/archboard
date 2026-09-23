---
id: TASK-302.03
title: A navigator that stays navigable at 200 boards
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
updated_date: '2026-09-23 05:43'
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
- [x] #1 Each board appears on exactly one row of fixed height; the outline nests boards under folders and under their primary drill parent, and siblings sort by name; activity never reorders or resizes rows
- [x] #2 A row shows the board name, its level as a muted word, which panes show it, whether an agent works on it, and how many other states it has
- [x] #3 The variant ancestry of the board in the active pane is listed under its row, and any other board's states open from its row; choosing one opens it
- [x] #4 A filter reachable by / and Ctrl+K narrows the outline in place in tree order by name, folder, variant and description, with a count and a clear control
- [x] #5 Enter or a click opens into the active pane and Alt+Enter or Alt+click into the other pane (adding pane B when there is one pane), each as the person's own move (ADR 0034)
- [x] #6 Boards an agent is claiming or recently wrote are gathered in a working-now block with the latest doing line and its age, absent when nothing is live
- [x] #7 Loading, empty, unreadable-listing and offline states are drawn; there are no eyebrows
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped: outline from folders, drill parents and names (src/ui/board-catalog/lib/outline.ts); rows, filter, keys and ARIA tree (src/ui/shell/lib/{navigator-rows,outline-keys,text-match}.ts, src/ui/shell/components/{Navigator,BoardOutline,OutlineRow,NavigatorFilter,WorkingNow}.tsx); open beside via ShellActions.openBeside (use-beside-opening). Decisions: a board nests under a container it describes, else the closest coarser board that drills down to it (a container link running down the levels counts as down); long names wrap to two lines rather than truncate (the design record's 28/44px rows), so 'one row of fixed height' reads as one row per board whose height never changes with activity; a board's states follow the person's explicit choice, the board being read listing them until closed. Review loop (9 reviewers, 2026-09-23) findings fixed in ddef2525: keyboard states (Right/Left), full accessible names, single selection and one sibling group, filter count by state matches, filter-aware Left/Right, folder case folding, container direction by level, listing refresh on board version, reveal once drawn, '/' in tree, find during presentation, beside pending cleanup, 24px targets.

Verification: src/ui/board-catalog/tests/outline.test.ts (placement, folders, container direction, case-folded folders), src/ui/shell/tests/navigator-tree.test.tsx (one row per board, states of the read board, open and beside, arrow keys incl. states, type-ahead filter with count, working-now never reorders), browser owners workspace-address (address records the opened board, Back retraces, a variant chosen for one pane moves only that pane) and shell-layout (render matrix incl. navigator, activity never resizes the panes), rendered captures on the work and dogfood vaults in both themes (docs/design/assets/operator-shell-navigator.png). AC #1 reading: a board is one row whose height never changes with activity; a long name wraps to a second line instead of truncating (design record). Gate on 2026-09-23: lint, fmt, type-check, test:system 170/0, test:repository 8/0, test:serial-browser pass; test:modules 3275 pass with the 10 pre-existing skill-evaluation suite failures (skill text naming evaluation terms, present on c933afd8).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The navigator organises the vault: folders from names, then each board under the container it describes or the closest coarser board that drills into it, then numeric-aware name order — one row per board with its level, states count, panes and agent lamp, the read board's states nested by ancestry, a filter (/, Ctrl K, type-ahead) that keeps tree order and counts what it found, an ARIA tree with arrow keys that open boards then states, Alt to open beside, and a Working now block for live agent work. Verified by outline and navigator-tree unit owners, the workspace-address and shell-layout browser owners, and rendered captures in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
