---
id: TASK-558
title: >-
  Record the Rust core and the Blocks planner in the canonical architecture
  model
status: To Do
assignee: []
created_date: '2026-10-30T13:45:00Z'
labels:
  - architecture
  - renderer
dependencies: []
ordinal: 971000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #19 replaced the legacy boards with the canonical model. Its migration ran before PR #24 and PR #25 landed, so it never saw the proposals they added to six legacy boards: Archboard server, Board rasterizer, Board viewer, Browser application, Renderer layout and Semantic renderer (TASK-520.*, TASK-548.*, TASK-554). The owner chose to keep the canonical model and delete those boards when PR #19 was rebased. Those proposals remain in the Git history of main. The canonical model still describes the renderer as it stood before the Rust core: bring it up to date with the canonical model commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The canonical model describes the Rust renderer core, its crates and the host hand-off of ADR 0059
- [ ] #2 The canonical model describes the Blocks route planner and the default engine of ADR 0063 and ADR 0064
- [ ] #3 A retained checkpoint holds the change, and the archive is published
<!-- AC:END -->
