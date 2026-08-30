---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.08
  - TASK-143.01.09
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/codex-workbench
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the server adapter in `src/server/codex-workbench`: translate the typed session and thread-link ports once into the shared browser contract, accept validated commands, and arbitrate one browser connection lease. The existing canvas application receives one registration call.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gateway exposes only shared DTOs and validated commands; generated protocol, credentials, rollout storage, process handles, and runtime objects never cross into the browser.
- [ ] #2 One browser connection owns reverse-request presentation; a second owner is refused until explicit transfer, and owner loss sends the generated terminal response for every pending request before transfer.
- [ ] #3 Same-child browser reconnect rehydrates the closed snapshot; replacement-child, lease loss, and unavailable thread states remain visible and non-executable.
- [ ] #4 Server tests cover command validation, lease transfer/loss, exact-once responses, reconnect, and the single mechanical integration call in `src/server/canvas`.
<!-- AC:END -->
