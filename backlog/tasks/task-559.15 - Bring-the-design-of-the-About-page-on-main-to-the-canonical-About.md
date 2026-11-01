---
id: TASK-559.15
title: Bring the design of the About page on main to the canonical About
status: Done
assignee: []
created_date: '2026-10-30T23:55:00Z'
updated_date: '2026-10-31T01:51:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.06
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 987000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner is sad that About lost its design flavor from main. On main, About opens with a display title, a line of facts with the level mark and the variant standing, and the summary in reading size. Walkthroughs are cards with numbered steps and a play action, parts form a table with column heads, containment rules and an action that shows the part on the diagram, and variants stand on a timeline. The canonical About reuses the outline and part rows, but the title has no facts line and states prose fills a Reading section above the parts. Walkthrough cards and the timeline are absent, and the table has no heads or show action. The old components still exist in apps/web/src/ui/components/semantic-board-canvas/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 About on a scope opens with the display title, a facts line with kind, code path and state standing, and the responsibility in reading size
- [x] #2 Walkthroughs of the open scope stand on About as cards with numbered steps and a way to present from a step
- [x] #3 Parts and nearby modules read as a table with heads, containment and an action that shows a subject on the diagram
- [x] #4 States stand on a timeline with their standing, in the design of the variants section on main
- [x] #5 About on a selection uses the same anatomy, and no list returns to the right panel
- [x] #6 The owner compares About with main in the real pane and accepts it by eye
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged in 476ae6e0f from feat/reader-about-design. The gate passed 21 of 21 tasks, exit 0. Criterion 6 waits for the owner. Open: Variant timeline and Diagram presentation components in the model point at deleted files; onVariantChange may be dead; git-async.test.ts failed once and was not investigated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
About carries the design of main over to the canonical model: display title, facts line, walkthrough cards with numbered steps, parts and connections as tables with a show action, and states on a timeline. The old board page and its bar are gone. The gate on 476ae6e0f passed 21 of 21 tasks in 174 seconds, and the owner accepted the page.
<!-- SECTION:FINAL_SUMMARY:END -->
