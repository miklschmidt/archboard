---
id: TASK-143.01.02
title: Define the closed Codex browser contract
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
labels: []
dependencies:
  - TASK-143.01.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/shared/codex-browser-model
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the shared DTO, runtime schema, event stream, command set, and capability model that the server publishes and browser consumes. This leaf owns only `src/shared/codex-browser-model`; generated app-server types remain runtime-private.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The public contract is a closed discriminated model for process/session state, thread links, timelines, queue, approvals, coordinator, callbacks, semantic context, and voice capabilities.
- [ ] #2 Commands always carry the exact target identity and expected state token; reconnect and unknown-item outcomes are explicit rather than inferred from recent activity.
- [ ] #3 JSON fixtures prove decoding, stable identity, unknown-item preservation, and exhaustive handling without imports from `src/runtime`, `src/server`, or `src/ui`.
<!-- AC:END -->
