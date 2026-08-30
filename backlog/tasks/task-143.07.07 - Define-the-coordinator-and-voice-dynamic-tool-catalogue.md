---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.03
  - TASK-143.01.07
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tool-contract
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load and validate the reviewed eager archboard_workhorse and archboard_voice namespace manifests/result schemas. It authors no text and dispatches no effect. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The catalogue uses the frozen tool names, descriptions, schemas, and coordinator identity; queue operations are exactly add, list, update, delete, reorder, and start, with no synthetic revision field.
- [ ] #2 Every entry declares authority target, caller role, required links, success result, and typed refusal/error set; operation-dependent queue fields match exact 0.151.0 params.
- [ ] #3 Snapshot tests reject manifest drift, extra/missing tools, nonexistent queue operations, ambiguous descriptions, and catalogue definitions outside this owner.
<!-- AC:END -->
