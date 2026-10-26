---
id: TASK-548.06
title: A whole solve tries its wrap candidates side by side
status: To Do
assignee: []
created_date: '2026-10-26T10:51:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The critical path of Agent workbench and Board viewer is one whole solve (native critical_path example on feat/faster-first-render: 482 and 541 ms). Its wrap search (crates/archboard-layout blocks/wraps.rs) makes 8 or 9 sink checks one after another, each a Graphviz call, and Board viewer keeps no wrap. docs/design/first-render-critical-path.md, 'What still stands between them and 500 ms', estimates the path at the stack prefix plus the slowest candidate, near 300 ms native, if the candidates are solves of their own asked at once through the Solver port. It costs more CPU and changes the solve protocol. The same whole solve is also what a re-render after a card grows waits for (860 to 940 ms through the pool). The owner's goal is real-time scene changes, with complex boards under 500 ms.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The native critical path of Agent workbench and Board viewer falls, measured with the critical_path example before and after
- [ ] #2 The order of the asks, the call-off of unneeded candidates and the failure paths are held by tests in crates/archboard-layout
- [ ] #3 Every drawing of the corpus is unchanged
- [ ] #4 timing.ts first renders and a re-render after a card grows are measured through the pool, alternating with the parent commit
<!-- AC:END -->
