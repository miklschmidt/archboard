---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 17:03'
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
- [ ] #1 The catalogue uses the frozen tool names, descriptions, JSON Schemas, and coordinator identity from docs/design/codex-workbench-authored-contracts.md; queue results contain no synthetic revision or compare-and-swap field.
- [ ] #2 Every catalogue entry declares its authority target, allowed caller role, required thread links, success result, and typed refusal/error set.
- [ ] #3 Snapshot tests reject manifest drift, extra tools, missing required fields, ambiguous descriptions, and catalogue definitions outside this owner.
<!-- AC:END -->
