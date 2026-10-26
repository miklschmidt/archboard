---
id: TASK-548.04
title: >-
  The core's own layout of a solve gets faster, along the critical path of a
  first render
status: To Do
assignee: []
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T02:30:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Half of every solve's CPU is the core's own layout (Blocks and Track in crates/archboard-layout, the router in crates/archboard-router), measured on feat/rust-desktop-frontend: 9.9 s of 20.3 s solve CPU over the 23 first renders of timing.ts. A first render waits on its longest chain of solves: Agent workbench took 1,791 ms with a longest single solve of 866 ms, and adding threads beyond 4 gained about 14% (spike/wasm-threads). So the time to remove is on the critical path: the solves a choice must wait for, one after another, and the core work inside each.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/design records the critical path of the slowest first renders: which solves run one after another, and how each splits between Graphviz and the core's layout
- [ ] #2 Every drawing of the corpus is unchanged
- [ ] #3 The first-render total of timing.ts falls, measured against the commit before the change on the same machine
- [ ] #4 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->
