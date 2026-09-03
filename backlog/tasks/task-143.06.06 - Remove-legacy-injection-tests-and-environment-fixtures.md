---
id: TASK-143.06.06
title: Remove remaining legacy injection environment sanitization
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-03 02:18'
labels: []
dependencies:
  - TASK-143.08.01
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
1. Reconfirm the fixed base and dependency eligibility, then inspect the current process-contract environment helper and the detached candidate diff as evidence only. 2. Remove only the ARCHBOARD_INJECT prefix sanitization from tests/system/process-contracts/support/process-http.ts; preserve the existing CODEX_HOME clearing, explicit HOME/XDG_STATE_HOME/CODEX vault isolation, exact src/bin.ts launch, and owned app-server environment setup. 3. Validate the touched helper with the smallest focused process-contract/repository-policy checks available, without adding tests or running broad process, system, browser, or repository lanes. 4. Record command results and any pre-existing unrelated failures in progress notes, commit the narrow change conventionally, and leave this task In Progress with acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved replacing the impossible all-green AC #4 with fixed-base non-regression because the complete process, system, and repository lanes were already red before this task's change.

Implemented the narrow cleanup on fixed base 503bae209c970b72240489213e704de771565b77. Removed only the ARCHBOARD_INJECT* prefix deletion from tests/system/process-contracts/support/process-http.ts. The existing CLEARED entries, including CODEX_HOME, and explicit HOME, XDG_STATE_HOME, ARCHBOARD_VAULT, EXPRESS_SERVER_URL, EXCALIDRAW_NO_AUTOSTART, and src/bin.ts launch remain unchanged. Focused validation used the required capped wrapper: bun test --isolate tests/system/repository-policy/legacy-injection-removal.test.ts passed 2/2 with 5 assertions in unit archboard-task143-worker-command-7smAfqYr.service; bun test --isolate tests/system/process-contracts/resource-cleanup.test.ts first stopped before test execution because zod was absent from the fresh worktree, then passed 8/8 with 69 assertions in unit archboard-task143-worker-command-RgS73uZn.service after bun install --frozen-lockfile. Final git diff --check passed, the owned executable search found no ARCHBOARD_INJECT, control-socket, or shared-daemon reference, and only the support file plus this Backlog record are modified. No broad process, system, browser, or repository lane ran. Acceptance criteria remain unchecked and task remains In Progress.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: 0e74cbaf is the strongest selective-replay candidate because it is a narrow cleanup above ba1aacee. Keep its head durably referenced, but do not replay or validate it until TASK-143.08.01 removes the OOM mechanism.
---
<!-- COMMENTS:END -->
