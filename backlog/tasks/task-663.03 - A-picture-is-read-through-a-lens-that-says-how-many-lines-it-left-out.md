---
id: TASK-663.03
title: A picture is read through a lens that says how many lines it left out
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:25:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1147000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reading side of TASK-663. Built-in lenses: main (the default: hides dependencies and in-process queries and computes, shows every mutation and all traffic between processes), effects (every mutation however it travels), reads, network, dependencies, all. A vault replaces a built-in in place. A lens never removes a part of its scope. The CLI takes --lens <id> on render and rasterize (ids only; refused on a sequence or flowchart); --hide-kind stays. The picture says how many lines the lens left out, even without a legend; the browser has a lens control and Show all selects the all lens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every built-in lens draws what its definition shows and never removes a part
- [ ] #2 model render and model rasterize take --lens, refuse it on a flow grammar, and the recipe records it
- [ ] #3 A picture through a lens that left lines out says how many, with and without a legend
- [ ] #4 The browser reading chooses a lens, remembers it in the address, and Show all selects all
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Model: a lens rule module (selector matching, the lens in effect for a policy and an id); projectModel takes filters.lens, keeps every part of its scope, applies manual kind hides after the lens under their existing stranded rule, and returns the lens in effect and the count of joined lines left out against the all lens.
2. Contract: the render request takes lens; the server refuses an unknown lens with the ids it has, and records the lens in effect in the recipe; a recipe without one replays as all.
3. CLI: --lens on model render and rasterize (and browser show), refused with a flow grammar; --hide-kind help says it subtracts from the lens.
4. Renderer core: the export frame takes the left-out note and draws it under the picture with or without a legend.
5. Browser: lens in the address per pane, a lens control in the legend's Relationships section, the left-out note, Show all selects all and clears hides; changing lens clears hides; bookmarks and beats read through all.
6. Tests through each interface; screenshots in both themes; gates.
<!-- SECTION:PLAN:END -->
