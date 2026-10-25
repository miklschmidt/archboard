---
id: TASK-514
title: >-
  A joined overview line stacks the labels of the relationships it joins, and
  its tip names each one
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 02:08
updated_date: '2026-10-25T00:22:00Z'
labels:
  - semantic-model
  - renderer
dependencies:
  - TASK-513
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
priority: medium
type: bug
ordinal: 921000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-513 labeled a joined overview line with its count ("5 relationships"). On Device Trust Library the owner found that label of little use on 2026-10-24, and the tip over the line still described only its first relationship: subjectTip in apps/web/src/ui/clients/semantic-board-canvas/subjects/subject-tips.ts reads the line id against the whole variant. The owner asked for the labels of the joined relationships to be stacked on the line instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A joined overview line carries the distinct labels of its relationships, in board order, stacked one block per relationship in both the blocks and track engines
- [x] #2 A joined line whose relationships carry no label draws no label, as a single unlabelled relationship does
- [x] #3 The tip over a joined line in the overview names the drawn ends and every joined relationship with its own ends, never one member as the line
- [x] #4 ADR 0052 and CONTEXT.md state the stacked rule
- [x] #5 Each stacked label stands on a chip of its own, padded as a lone label, with the ground between chips and no line across a chip, in light and dark themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scope.ts oneLine stacks distinct member labels with a line break. It carries no label when no member has one.
2. measureLabel wraps each label on its own chip, with the same padding as a lone label and a gap between chips. architecture.ts paints each chip and its shadow.
3. In the overview, subject-tips.ts names the drawn ends and every member with its own ends. SemanticDiagram passes the overview flag.
4. The inspector titles a joined line by its drawn ends.
5. ADR 0052 and CONTEXT.md state the stacked-label rule.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause of the tip defect: subjectTip read the line id against the whole variant (subject-tips.ts labelTip), so it described the first member. Verified: stacked-labels render test (blocks, track), scope, tip and inspection tests fail without the change and pass with it. Device Trust Library re-rendered after archboard restart in blocks and track, light and dark: each joined line stacks its labels with a rule between them; Everything keeps the saved labels. Live pane: hovering the cAR746dp label shows the drawn ends and all five calls with their own ends. bun run check passed to completion.

Owner rejected the hairline rule between stacked labels (DESIGN.md Planes Not Lines Rule). Each label now stands on its own chip (measured chips in MeasuredLabel, slab and shadow per chip in architecture.ts), with a 4-unit gap. Re-rendered in blocks and track, light and dark.

Pre-push review derives the temporary chip type from MeasuredLabel instead of repeating its fields. The plan and summary now describe the final separate chips, which replaced the rejected divider rule. No rendering behavior changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A joined overview line stacks the distinct labels of its relationships. Each label wraps on its own padded chip, with a gap between chips. The tip and inspector name the drawn ends and every relationship with its own ends. ADR 0052 and CONTEXT.md state the rule. A stack with many members grows tall, with no cap.
<!-- SECTION:FINAL_SUMMARY:END -->
