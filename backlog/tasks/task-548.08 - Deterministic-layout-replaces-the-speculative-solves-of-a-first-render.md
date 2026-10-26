---
id: TASK-548.08
title: Deterministic layout replaces the speculative solves of a first render
status: To Do
assignee: []
created_date: '2026-10-26T16:24:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 961000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner's goal is real-time scene changes, with complex boards (Board viewer, Board persistence, Archboard server routes on main's vault) laid out in under 500 ms. Today a first render lays a board several ways in parallel solves (the stacking choice, wrap candidates, joins and regions choices) and keeps the best, and each solve calls Graphviz many times through a text port. The owner sees layout as a math problem that deterministic heuristics can decide up front, and allows moving the layout into the vendored Graphviz crates (crates/vendor, no upstream compatibility needed). Byte-identical drawings are no longer required: the grading council of TASK-548.09 judges every changed drawing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 First renders of the slowest vault boards are measured before and after on a quiet box, and recorded in docs/design
- [ ] #2 Every changed drawing passes the grading council of TASK-548.09, and the council's verdicts are recorded
- [ ] #3 The design and the levers tried, kept or dropped are recorded in docs/design, with ADRs for any decision that replaces ADR 0059 or ADR 0060
<!-- AC:END -->
