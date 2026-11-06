---
id: TASK-582.03.03
title: 'Layout C: the CLI, the server and the web app lay out behavior first'
status: To Do
assignee: []
created_date: '2026-11-06T19:06:00Z'
labels: []
dependencies:
  - TASK-582.03.02
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1031000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/cli, apps/server and apps/web hold the remaining 33 containment warnings. Plan: doc-003, steps C1 to C3, including the merge of the duplicate code-evidence modules in the server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check on this repository reports no containment warning
- [ ] #2 The duplicate modules that describe the same server code are merged as the code shows, with their flow steps retargeted
- [ ] #3 Each step is its own commit that leaves bun run check green
<!-- AC:END -->
