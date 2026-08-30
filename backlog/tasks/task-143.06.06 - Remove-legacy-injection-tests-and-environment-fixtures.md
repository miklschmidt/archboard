---
id: TASK-143.06.06
title: Remove legacy injection tests and environment fixtures
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.06.05
modified_files:
  - tests/system/canvas-state/injection.test.ts
  - tests/system/canvas-state/support/injection-daemon.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/cli/support
  - tests/system/process-contracts/support/process-http.ts
  - tests/system/repository-policy/test-inventory.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 251000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Delete obsolete injection system/support fixtures and remove ARCHBOARD_INJECT sanitization from current process/browser/CLI fixtures. Serialize this before new browser-owner registration. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Legacy injection test and fake daemon are deleted, and shared fixtures no longer set/clear ARCHBOARD_INJECT*, emulate injection routes, or assert injection schemas.
- [ ] #2 Canonical test inventories/counts remove the retired owner before TASK-143.03.13 adds the text browser owner; no missing, duplicate, or unreachable test remains.
- [ ] #3 Remaining environment sanitization still clears current Codex workbench roots/process variables without preserving obsolete injection names as behavior.
- [ ] #4 The complete module/system/repository suites pass and no fixture can accidentally connect to a Desktop/shared-daemon control socket.
<!-- AC:END -->
