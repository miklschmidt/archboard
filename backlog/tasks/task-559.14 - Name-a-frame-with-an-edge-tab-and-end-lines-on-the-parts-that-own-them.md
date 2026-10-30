---
id: TASK-559.14
title: Name a frame with an edge tab and end lines on the parts that own them
status: To Do
assignee: []
created_date: '2026-10-30T23:06:00Z'
updated_date: '2026-10-30T23:32:00Z'
labels:
  - renderer
  - frontend
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 986000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner compared header mockups in /tmp/integrate/header-mockups/ and chose the edge tab: one line with the name and path on the frame edge, with the side of the tab running straight into the side of the frame. The card that stands in a frame takes a cell, which forces dead space, and the caption repeats its description. The owner also saw lines from outside cards landing on the frame and judged that a mistake, because the code reaches a part such as Entry point. Rule 5 sends a line to the frame when more than one part reaches a door. In Command startup the module owns no relationship: Entry point and Command routing reach Workspace packages, and all three parts reach Command contract. A line on the frame reads as the container acting, and it hides which part acts and what that part does. An estimate from the vault gives 555 door lines today, 213 of them on a frame, and 971 if every line ends on its part. Commands would go from 6 to 34 lines, so large readings need a way to hold that cost.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A frame shows its name and path in one edge tab, with no card and no cell inside the frame, and the side of the tab is the side of the frame
- [ ] #2 A line ends on the part that owns it, and each such line wears the label of that part
- [ ] #3 A reading where many parts reach one door stays readable, and the design record states the rule and its threshold, with measured line counts before and after
- [ ] #4 A selected tab opens the module, and its description stays reachable in the reader and in exports
- [ ] #5 Gates 1 to 4 and frame fill are measured again and any change is stated
- [ ] #6 The owner sees the result in the real pane and accepts it by eye
- [ ] #7 In a reading such as Commands, a reader sees which parts reach which outside card, and a part only loses its last line by a stated rule
- [ ] #8 Cards in one frame stand on a shared grid with one column gap and one row gap, and any exception is stated in the rule
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner accepted variant E of the header mockups, with the tab keeping a background lighter than the floor. On Commands at c68fbb308, 43 relationships give 10 lines, four frame lines hold 37, and 16 of 24 parts show no line. Those 24 cards stand at 10 left edges and 8 top edges. A threshold that keeps many-part lines on the frame does not meet the owner request.
<!-- SECTION:NOTES:END -->
