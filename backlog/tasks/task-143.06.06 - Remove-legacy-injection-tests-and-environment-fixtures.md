---
id: TASK-143.06.06
title: Remove remaining legacy injection environment sanitization
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
updated_date: '2026-08-30 17:29'
labels: []
dependencies:
  - TASK-143.06.05
modified_files:
  - tests/system/process-contracts/support/process-http.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 251000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove obsolete ARCHBOARD_INJECT environment handling from the remaining process-contract support after server, browser, and CLI owners have retired their behavior. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Process-contract support no longer sets, clears, forwards, or documents ARCHBOARD_INJECT* or a Desktop/shared-daemon control socket.
- [ ] #2 Current CODEX_HOME, CODEX_SQLITE_HOME, binary, and owned app-server environment isolation remains explicit and unchanged.
- [ ] #3 Repository search distinguishes historical ADR/research text from executable environment handling and finds no remaining test helper that can connect to the retired socket.
- [ ] #4 The complete process/system/repository lanes stay green without an injection fake, compatibility variable, or hidden route.
<!-- AC:END -->
