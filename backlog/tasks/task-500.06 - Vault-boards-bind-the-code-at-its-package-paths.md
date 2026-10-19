---
id: TASK-500.06
title: Vault boards bind the code at its package paths
status: To Do
assignee: []
created_date: '2026-10-19 02:53'
labels: []
dependencies:
  - TASK-500.05
parent_task_id: TASK-500
ordinal: 871000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each package move renames the files that .archboard/vault boards bind with binding paths. After timing, diagnostics, process and workspace, bindings such as engine/repo-registry.ts, vault-finder.ts, source-checkout.ts, atomic-write.ts and server/archboard/lib/repositories.ts no longer exist, so the code check reports BINDING_PATH_MISSING for them and the next agent learns a wrong map of the repository. The moves are the architecture change, so the boards must show the packages (archboard-dev: a task adopts a proposal when it closes).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every binding in .archboard/vault resolves to a file that exists, and the code check on each board reports no BINDING_PATH_MISSING
- [ ] #2 The Archboard board shows the workspace packages and their layers as parts, adopted from a proposal named for this task
<!-- AC:END -->
