---
id: TASK-377
title: Every vault board lays out within the 1 s render budget on both engines
status: To Do
assignee: []
created_date: '2026-09-29 18:33'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 661000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured 2026-09-29 on a quiet machine (load 0.8), each drawing's first render in one warm process, two runs agreeing within a few percent: Agent workbench takes 1.37 s on Track and about 4.9 s on Blocks, Browser application 1.73 s on Blocks, Archboard server about 1.0 s on Blocks. Every other tracked board lays out in under 0.9 s. The boards grew with TASK-373's adoption. Track is the default engine, so the Agent workbench's 1.37 s is what a reader waits for today. Later renders of the same content are cache hits of a few milliseconds, so only a first render measures layout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every tracked vault board's first render takes under 1 s on Track and on Blocks, measured in one warm process on a quiet machine
- [ ] #2 No board's picture gets worse: the renderer's corpus tests pass and a before-and-after look at the changed boards shows the same or better drawing
- [ ] #3 A test or measured check owns the budget so a later regression is caught
<!-- AC:END -->
