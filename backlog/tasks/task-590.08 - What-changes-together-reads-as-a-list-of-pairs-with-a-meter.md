---
id: TASK-590.08
title: What changes together reads as a list of pairs with a meter
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:48:00Z'
updated_date: '2026-11-07T13:46:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1051000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site Changes together list: each pair of modules with a line or a dashed line between them, the shared commits, the degree and a meter along the foot, and an Unjoined chip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each module that changes with a selected module shows its name, a line or a dashed line that joins it to the module, its shared commits and its degree
- [x] #2 A meter along the foot of a row shows the degree, gold for a joined pair and orange for an unjoined pair
- [x] #3 An unjoined pair carries the tinted Unjoined chip
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Give the panel row an optional mark along its foot.
2. Lay out each partner of the selected module as the site's pair: a solid or dashed orange line, the Unjoined chip, the shared commits and the degree, with a meter of the degree along the foot.
3. Give the changed chips words that keep APCA Lc 60 in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The shell lists the partners of one selected module, which heads the panel, so a row names the partner and its line stands for the join to that module. AC1 was reworded to that. The tinted chip sets its words in ink, because the orange on its tint reads only Lc 51 to 56; the solid chip is white on chalk and near black on graphite.

Verified by captures of Diagram surface in this repository's own model in both themes, and model-changes-with.test.tsx.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The modules that change with a selected module read as the site's Changes together list: a solid or dashed orange line, the Unjoined chip, the shared commits, the degree, and a gold or orange meter of the degree along each row's foot. The changed chips now keep APCA Lc 60 in both themes. Verified by captures in both themes and the unit tests.
<!-- SECTION:FINAL_SUMMARY:END -->
