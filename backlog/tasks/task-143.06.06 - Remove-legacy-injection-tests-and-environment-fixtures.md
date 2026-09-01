---
id: TASK-143.06.06
title: Remove remaining legacy injection environment sanitization
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-01 19:10'
labels: []
dependencies:
  - TASK-143.06.05
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
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
- [ ] #4 Against the fixed implementation base, focused process-contract and repository-policy owners for the touched support stay green and broader process/system/repository lanes introduce no new failure attributable to this change; pre-existing unrelated failures are recorded rather than reclassified as task failures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the review-clean removal of legacy injection sanitization. 2. Rebase or replay it onto the reopened canonical base. 3. Run focused process-contract and repository-policy owners for the touched helper. 4. Compare any broader-lane failures with the fixed base and accept only no-new-failure evidence. 5. Send the complete fixed-base range to independent review before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved replacing the impossible all-green AC #4 with fixed-base non-regression because the complete process, system, and repository lanes were already red before this task's change.
<!-- SECTION:NOTES:END -->
