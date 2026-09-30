---
id: TASK-384
title: The navigator shows boards and their variants on one consistent indentation
status: To Do
assignee: []
created_date: '2026-09-30 18:51'
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
- [ ] #1 Before the redesign, a written study names the structures a vault holds (folders, drill levels, variants in their lifecycles, drafts derived from drafts) and the navigation tasks, and says what the tree must show at each depth; the task notes link it
- [ ] #2 Every depth of the tree indents by one fixed step, and the disclosure control, marker, name and trailing facts of every row sit on the same grid at that depth, for folders, boards, variants and drafts
- [ ] #3 A reader tells a board from its variants at a glance, and sees which board and variant each pane shows without opening anything
- [ ] #4 The tree keyboard, the filter and Working now keep their behaviour
- [ ] #5 Rendered captures of the navigator before and after, in both themes at 1920×1080, on the dogfood vault and on a vault with folders and nested drafts, replace the navigator image in docs/design/assets and the navigator section describes the new representation
- [ ] #6 bun run check passes
<!-- AC:END -->
