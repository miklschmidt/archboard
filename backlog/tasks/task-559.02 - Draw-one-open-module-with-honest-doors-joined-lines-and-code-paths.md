---
id: TASK-559.02
title: Draw one open module with honest doors, joined lines and code paths
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
labels:
  - frontend
  - renderer
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 974000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Round 2 measured total area of 392.9 M today against 175.9 M under these rules, and most of the dead space that the owner saw comes from what a picture holds. This slice is the fastest test of the design, so it comes before interface work. The rules live in the projection, so the CLI and exports draw the same picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rules 1 to 11 of the section What a picture draws hold in the projection, for the reader and for `archboard model render`
- [ ] #2 A joined line with mixed kinds wears a neutral style, and hiding one kind never hides a relationship of another kind
- [ ] #3 A line that leaves a picture is counted in a statement that the caption shows, and one control shows every line
- [ ] #4 No connected part loses its last line through reduction
- [ ] #5 A reading lands by the rule of the section Where a reading lands
- [ ] #6 Gates 1, 2, 3 and 4 of the design record hold, measured on the merged renderer core
- [ ] #7 The owner sees the root, `Browser`, `Workspace packages` and `Command startup`, and accepts the change to ADR 0052 or rejects it
<!-- AC:END -->
