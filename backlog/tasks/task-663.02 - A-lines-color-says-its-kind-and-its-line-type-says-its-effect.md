---
id: TASK-663.02
title: A line's color says its kind and its line type says its effect
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The drawing side of TASK-663. Every kind but call keeps its theme-paired ink; mutation draws solid, query dashed, compute dotted; a dependency without an effect has its own pattern; one filled arrowhead on every line, for direction only; a colored line's label carries the kind's name; several relationships drawn as one line wear the strongest effect (mutation over query over compute); a comparison keeps its standing colors and the dash still says the effect; a reading from before the upgrade keeps its recorded look. The legend has the kind switches and a read-only effect key. Respect DESIGN.md and both themes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each effect draws its line type in both renderers (native and WebAssembly paint the same) and in both themes
- [ ] #2 A joined line wears the strongest effect of its relationships
- [ ] #3 A comparison keeps standing colors and effect dashes
- [ ] #4 The legend shows the kinds drawn and an effect key
- [ ] #5 Screenshots of a wide scope in both themes are inspected and attached to the pull request
<!-- AC:END -->
