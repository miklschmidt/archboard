---
id: TASK-143.01.02
title: Define the closed Codex browser contract
status: To Do
assignee: []
created_date: '2026-08-30 15:06'
updated_date: '2026-08-30 15:39'
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
- [ ] #2 Commands carry exact target identity and expected state token; reconnect, unknown-item, cancellation, and stale-state outcomes are explicit rather than inferred from recent activity.
- [ ] #3 The reverse-request policy names one browser lease owner, maps every generated request variant to its legal response and owner-loss terminal response, and gives nonowners inspection without a response path.
- [ ] #4 JSON fixtures in src/shared/codex-browser-model/tests prove decoding, stable identity, every active/empty/progress/failure/recovery state, unknown-item preservation, and exhaustive handling without runtime/server/UI imports.
<!-- AC:END -->
