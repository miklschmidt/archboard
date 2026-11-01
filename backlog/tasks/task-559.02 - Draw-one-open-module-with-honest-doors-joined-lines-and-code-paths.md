---
id: TASK-559.02
title: Draw one open module with honest doors, joined lines and code paths
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-30T19:51:00Z'
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
- [x] #1 Rules 1 to 11 of the section What a picture draws hold in the projection, for the reader and for `archboard model render`
- [x] #2 A joined line with mixed kinds wears a neutral style, and hiding one kind never hides a relationship of another kind
- [x] #3 A line that leaves a picture is counted in a statement that the caption shows, and one control shows every line
- [x] #4 No connected part loses its last line through reduction
- [x] #5 A reading lands by the rule of the section Where a reading lands
- [ ] #6 Gates 1, 2, 3 and 4 of the design record hold, measured on the merged renderer core
- [ ] #7 The owner sees the root, `Browser`, `Workspace packages` and `Command startup`, and accepts the change to ADR 0052 or rejects it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Gates on the merged core: 108 of 123 at fit 0.6 with no margin, name 12 px and path 9 px on 118 readings, 133 lines left out in 13 readings and all counted. Gate 4 holds by area, but Checkout API grew from 1326 by 1240 to 1800 by 664. The tree row of rule 10 waits for TASK-559.05. Pictures are in /tmp/integrate/slice1. The owner still judges the pictures and the change to ADR 0052.

Owner verdict, 2026-10-30: all four pictures read far better than today, so the interface work continues. The owner named these flaws: dead space in frames, cards with paths that lose their descriptions, some cards sized oddly, probably from the far view, and no line with arrows at both ends for a pair that works both ways. ADR 0052: a joined line may drop its stacked labels only if a combined label gives a reader enough to understand what the relationships are. A count alone is not enough, which is why ADR 0052 exists. TASK-559.12 carries this.
<!-- SECTION:NOTES:END -->
