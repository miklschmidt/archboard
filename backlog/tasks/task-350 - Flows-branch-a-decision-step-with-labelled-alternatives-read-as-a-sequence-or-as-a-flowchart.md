---
id: TASK-350
title: >-
  Flows branch: a decision step with labelled alternatives, read as a sequence
  or as a flowchart
status: To Do
assignee: []
created_date: '2026-09-25 00:15'
updated_date: '2026-10-15 21:05'
labels:
  - semantic-model
  - renderer
  - skill
dependencies: []
priority: medium
type: feature
ordinal: 591000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User request 2026-09-25: better flow-chart semantics, starting with a decision element (the diamond of classic flowcharts). Today a flow is a linear list of steps and a branch can only be a note on a step. Proposal: decisions belong to the flow (the ordered exchange), not to architecture parts. A flow gains structured control: a decision step carrying a question and two or more labelled alternatives, each an ordered list of steps that rejoin after the decision, and a loop that repeats its steps while a condition holds; a flow may name where it starts and ends. One meaning, two readings: a data-flow view draws it as today's sequence diagram with the alternatives as labelled alt frames, and a new flowchart view draws steps as boxes and decisions as diamonds on the track engine (TASK-349), whose top-to-bottom tracks suit series-parallel flows. Needs a CONTEXT.md term, a schema version, the archboard skill's flow recipe, comparison of a branch across variants, and an ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flow can hold a decision with labelled alternatives that rejoin, and a loop with its condition, validated and compared like other steps
- [ ] #2 A data-flow view draws a decision as labelled alternative frames
- [ ] #3 A flowchart view draws steps as boxes and decisions as diamonds with labelled branches
- [ ] #4 The archboard skill teaches when a flow branches and how to author it, and an ADR records decisions as flow meaning
- [ ] #5 The grammar `data-flow` is renamed `sequence`, with a schema version that migrates every stored view
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR 0052 (2026-10-15): the owner confirmed renaming the grammar `data-flow` to `sequence` as part of this task, because `data-flow` draws a sequence diagram and a flowchart grammar beside it would make the name more misleading.
<!-- SECTION:NOTES:END -->
