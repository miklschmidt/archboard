---
id: TASK-582.03.02
title: 'Layout B: the packages lay out behavior first'
status: To Do
assignee: []
created_date: '2026-11-06T19:06:00Z'
labels: []
dependencies:
  - TASK-582.03.01
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1030000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The packages hold 50 of the 83 containment warnings: codex-app-server, walkthrough, workbench, skills, model, renderer and codex-realtime-voice, and the Rust crates. Plan: doc-003, steps B1 to B7, with the owner decisions at its top (voice: cut the model; crates: one root module per crate beside the packages).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check reports no containment warning for any module of those packages or crates
- [ ] #2 Each Rust crate is a root module bound to its crate directory, with no container around the crates
- [ ] #3 Each step is its own commit that leaves bun run check green and archboard check at the warning count the plan names
<!-- AC:END -->
