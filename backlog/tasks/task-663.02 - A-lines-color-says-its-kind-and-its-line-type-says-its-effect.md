---
id: TASK-663.02
title: A line's color says its kind and its line type says its effect
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:26:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model: a joined line carries the strongest effect of its relationships (mutation > query > compute > none); the render request edge carries effect.
2. Core request: a kind's dash is optional; a policy whose kinds record a dash is an old reading and keeps its recorded dash and arrowhead. Otherwise the effect sets the dash (solid, dashed, dotted), a dependency without an effect draws its own dash-dot pattern, and every head is filled.
3. Line appearance: the double rail of mixed kinds leaves the dash enum, so a mixed line wears the strongest effect's dash on its rails; the appearance names the effect for the legend.
4. Layout: lines share a trunk only when kind and effect agree (effect joins the trunk key and held treatment).
5. Labels: a colored line's label starts with its kind's name (current format only).
6. Legend: kind rows sample each kind solid in its ink (old readings keep their recorded sample); a read-only effect key lists the effects the reading holds, in the export legend and the browser legend.
7. Comparison keeps standing inks over the line; the dash still says the effect (test).
8. Tests across the module interfaces; screenshots of a wide scope in both themes from a scratch new-format copy of this vault; DESIGN.md line and legend paragraphs.
<!-- SECTION:PLAN:END -->
