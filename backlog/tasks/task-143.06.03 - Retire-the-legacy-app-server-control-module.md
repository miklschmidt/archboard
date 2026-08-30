---
id: TASK-143.06.03
title: Delete the legacy app-server control client
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.06.04
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/engine/app-server-control.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete the obsolete control-socket JSON-RPC client after all runtime imports are removed. Preserve measured/historical research that explains why it was replaced.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The app-server-control module is deleted with no runtime/server/UI import, export, duplicate framing helper, or shared-daemon socket lookup remaining.
- [ ] #2 The owned stdio session remains the only Codex JSON-RPC transport and repository policy rejects reintroducing control-socket production imports.
- [ ] #3 Historical ADR/research references may name the removed module but current architecture/docs cannot present it as runnable behavior.
- [ ] #4 Type, module, process, and repository tests pass without a compatibility shim or dead export.
<!-- AC:END -->
