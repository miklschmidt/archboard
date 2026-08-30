---
id: TASK-143.05.03
title: Define the six general thread-coordination tools
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.07
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-thread-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the exact eager `archboard_app` manifest and strict argument/result schemas in `src/runtime/codex-thread-tools`. It describes tools but does not dispatch app-server effects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard_app contains exactly create_thread, fork_thread, list_threads, read_thread, send_message_to_thread, and wait_threads; a byte fixture freezes every description, strict argument field, required/optional set, additionalProperties false, and text-only success/refusal/error result.
- [ ] #2 The manifest and stable hash are supplied only at general Archboard thread start and eligible create-thread children; attached threads never gain or replace persisted tools.
- [ ] #3 Schema fixtures reject unknown namespace/tool/field/media, caller-selected host/process identity, unsupported override, and malformed cursor/timeout, and bind the manifest hash to the reviewed instruction contract.
- [ ] #4 The module exposes catalogue data only; thread creation and call dispatch consume it through separate ports.
<!-- AC:END -->
