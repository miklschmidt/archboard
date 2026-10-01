---
id: TASK-384
title: The navigator shows boards and their variants on one consistent indentation
status: Done
assignee:
  - '@claude'
created_date: '2026-09-30 18:51'
updated_date: '2026-10-01 00:20'
labels:
  - ui
dependencies: []
priority: high
type: bug
ordinal: 663000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-09-30: the navigation side menu (the navigator, TASK-302) is visually broken. Indentation is all over the place: folders, drill levels, a board's variants and drafts nested under what they derive from do not line up, so a reader cannot tell at a glance what sits under what. The fix needs attention to detail on how boards and variants are structured (CONTEXT.md: Board, Drill-down, Variant) and on how best to show that structure, so that navigation is effortless. The placement rules in docs/design/operator-canvas-shell.md, section "The navigator", are product facts; how the tree draws them is open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Before the redesign, a written study names the structures a vault holds (folders, drill levels, variants in their lifecycles, drafts derived from drafts) and the navigation tasks, and says what the tree must show at each depth; the task notes link it
- [x] #2 Every depth of the tree indents by one fixed step, and the disclosure control, marker, name and trailing facts of every row sit on the same grid at that depth, for folders, boards, variants and drafts
- [x] #3 A reader tells a board from its variants at a glance, and sees which board and variant each pane shows without opening anything
- [x] #4 The tree keyboard, the filter and Working now keep their behaviour
- [x] #5 Rendered captures of the navigator before and after, in both themes at 1920×1080, on the dogfood vault and on a vault with folders and nested drafts, replace the navigator image in docs/design/assets and the navigator section describes the new representation
- [x] #6 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Study first (docs/design/navigator-structure.md): the structures a vault holds and how the placement rules turn them into a tree; the navigation tasks and how often each happens; captures of today's tree in both themes on the dogfood vault and on a scratch vault with every structure (folders two and three deep, drill chains, current plus drafts, draft on draft, historical and shelved variants, competing successors, a board with no current variant, long names, 260 boards); every indentation defect measured per row kind and depth, with its cause in the code; how established trees represent nesting (VS Code, WAI-ARIA APG, Primer, Apple HIG, Fluent/Carbon, sidebars) with citations; the resulting representation. Link it in the notes.
2. Redesign in src/ui/shell only (navigator-rows, outline-keys, the row components, filter, Working now, expansion hook): one tree grid (fixed step, disclosure, marker, name and facts columns at every depth for folders, boards, variants and nested drafts), variants set apart from boards, one selected row, each pane letter on the most specific visible row, the tray of every board a pane shows open. Split OutlineRow (500 lines) into a composite row and one small file per row kind.
3. Tests: update navigator-tree.test.tsx to the new rows and add the structural contract that every row at one depth shares one indent; keep the keyboard, filter and Working now owners.
4. Docs: rewrite 'The navigator' in docs/design/operator-canvas-shell.md (variant, not state) and replace docs/design/assets/operator-shell-navigator.png with rendered after captures; keep before/after captures under the job scratch directory.
5. bun run check, lane by lane when it stops early.
No dogfood board is affected: Browser application draws the Shell and the Board catalog, and neither is added, removed or rewired.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Study: docs/design/navigator-structure.md (with assets/navigator-structure-before.png). It measures 13 defects of the old tree on the dogfood vault and a 260-board scratch vault, both themes at 1920x1080, and names the cause of each in the code at 17aa518e: variants placed from the board's name column instead of their depth (0 px step), nested drafts stepping 12 px against 14 px for boards, variants and child boards interleaved on two grids, adoption chains nesting the current variant five levels deep, folder names 22 px right of board names, a marker column that meant something different per kind, floating facts, two rows styled as selected (cobalt on the dark tone at 2.75:1), mixed row heights, a fixed 30 px error indent, pane B's variant hidden, four text edges in one column, and two disclosures per board. Research on VS Code, WAI-ARIA APG, Primer, Carbon, Fluent, Apple HIG, Notion, Figma and NN/g is cited in the study.
Decisions: one 16 px step with four columns (disclosure, marker, name, facts) placed by depth alone; every row has a marker (folder, board, lifecycle, history); variants one depth in, before child boards, live first, a draft nested only under the draft it came from, historical and shelved behind one Earlier row; a board lists its variants while it has a proposal or a pane shows it; one disclosure per board; the way to every pane's reading is open; each pane letter on exactly one row; one selected row with the foreground name; the per-row level word is gone (hover, aria-label and the header keep it). No dogfood board is affected.

Implemented on branch ui/navigator-indentation: 3a87a1e7 (study), d701e764 (redesign), 503c0745 (navigator section and image), a832991f (row disclosure and selection read from the row). The navigator's owners pass: navigator-tree.test.tsx (7, including every row at one depth sharing one indent and each pane letter on exactly one row), shell-layout and workspace-address in the browser lane. bun run check passed on a832991f: lint, fmt, type-check, modules 3734, system 189, repository 8, serial browser 15 owners. Every row kind measured after: disclosure 9/25/41/57/73, marker 24/40/56/72/88, name 46/62/78/94/110 at levels 1 to 5, facts ending at 307, in both themes. Before and after captures are in the job scratch directory (listed in the hand-back). Criteria left unchecked for review.

Review fixes (51ccbeed, 41566d1e): S1 docs say the filter lists found variants directly under their board with no Earlier row; S2 a board name's title is name and level; S3 a selected row is never muted (also a selected receding variant); B1 the header marks the variant it names with its lifecycle; B2 new module src/ui/variant-lifecycle exports VariantMark, variantRecedes, variantOrder and ListedLifecycle for the navigator, the header and the pane sidebar; T1-T7 applied (grid widths and gaps from tree-grid, one paneCanShow guard, InsideLamp and MarkerLamp, EarlierLine in its own file, existing helpers and types reused). Verified: lint, both type-checks, fmt, module tests for shell, board-catalog and variant-lifecycle (22), and the browser owners shell-layout, workspace-address and semantic-drill-address.

Review (2026-10-01): standards, spec and a boundary review with TASK-383. Standards clean with seven judgement calls, spec clean with three, boundary found the header drawing the draft icon for a historical variant and two lifecycle languages; all applied in 51ccbeed and 41566d1e. Merged into main as 93481127, then e8ba2bc2 gave a hovered row half the reading tone so it never looks chosen, matching the pane sidebar. bun run check on main at e8ba2bc2: exit 0; modules 3735, system 189, repository 8, every serial browser owner passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The navigator draws every row on one grid placed by depth alone: a 16 px step with disclosure, marker, name and facts columns for folders, boards, variants and nested drafts. Variants sit one depth under their board with a lifecycle mark from the new shared module src/ui/variant-lifecycle (also used by the header), live ones first and historical or shelved ones behind one Earlier row; each pane letter sits on exactly one row and one row is selected. The study docs/design/navigator-structure.md measured 13 defects of the old tree and their causes before the redesign. Verified by navigator-tree.test.tsx (one indent per depth, pane letters), the browser owners shell-layout, workspace-address and semantic-drill-address, before and after captures in both themes, three reviews, and bun run check on main.
<!-- SECTION:FINAL_SUMMARY:END -->
