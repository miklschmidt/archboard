---
id: TASK-663.03
title: A picture is read through a lens that says how many lines it left out
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
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
