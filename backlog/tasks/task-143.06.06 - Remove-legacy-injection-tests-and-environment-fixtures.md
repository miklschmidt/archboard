---
id: TASK-143.06.06
title: Remove remaining legacy injection environment sanitization
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-03 02:31'
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

Remediation plan: replace sanitizedEnvironment's broad inherited-environment clone with an explicit positive allowlist containing only the proven PATH tool-discovery input plus existing owned values. Extend the existing resource-cleanup environment owner to prove an arbitrary inherited key is dropped while PATH, HOME, XDG_STATE_HOME, vault, and current CLI isolation remain set. Rerun that owner, legacy-injection policy owner, focused type/lint/format/diff checks under containment, and leave ACs unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved replacing the impossible all-green AC #4 with fixed-base non-regression because the complete process, system, and repository lanes were already red before this task's change.

Implemented the narrow cleanup on fixed base 503bae209c970b72240489213e704de771565b77. Removed only the ARCHBOARD_INJECT* prefix deletion from tests/system/process-contracts/support/process-http.ts. The existing CLEARED entries, including CODEX_HOME, and explicit HOME, XDG_STATE_HOME, ARCHBOARD_VAULT, EXPRESS_SERVER_URL, EXCALIDRAW_NO_AUTOSTART, and src/bin.ts launch remain unchanged. Focused validation used the required capped wrapper: bun test --isolate tests/system/repository-policy/legacy-injection-removal.test.ts passed 2/2 with 5 assertions in unit archboard-task143-worker-command-7smAfqYr.service; bun test --isolate tests/system/process-contracts/resource-cleanup.test.ts first stopped before test execution because zod was absent from the fresh worktree, then passed 8/8 with 69 assertions in unit archboard-task143-worker-command-RgS73uZn.service after bun install --frozen-lockfile. Final git diff --check passed, the owned executable search found no ARCHBOARD_INJECT, control-socket, or shared-daemon reference, and only the support file plus this Backlog record are modified. No broad process, system, browser, or repository lane ran. Acceptance criteria remain unchecked and task remains In Progress.

Review remediation completed against prior HEAD a0793f2286d49eb8fd590c577f54452fab267af. Replaced the broad inherited environment clone in tests/system/process-contracts/support/process-http.ts with an explicit positive environment containing only inherited PATH plus the helper's existing owned HOME, XDG_STATE_HOME, LOG_FILE_PATH, ARCHBOARD_VAULT, LOG_LEVEL, and NO_COLOR values. Ambient CODEX_HOME, CODEX_SQLITE_HOME, settle overrides, and an arbitrary unapproved key cannot cross this boundary; exact CLI and app-server ownership remains in the existing dedicated owners. Extended the existing resource-cleanup owner assertion without creating a fixture or test file. Final focused validation through the required capped wrapper: bun test --isolate tests/system/process-contracts/resource-cleanup.test.ts passed 8/8 with 76 assertions in unit archboard-task143-worker-command-gaQ2WmO0.service; bun test --isolate tests/system/repository-policy/legacy-injection-removal.test.ts passed 2/2 with 5 assertions in unit archboard-task143-worker-command-AZnyMNJN.service; focused Oxlint, Oxfmt check, and git diff --check passed in unit archboard-task143-worker-command-ZDBsMCve.service. bunx tsc --noEmit remains red only on unrelated pre-existing files: src/runtime/engine/git-process-owner.ts, src/runtime/engine/git.ts, src/runtime/engine/tests/board-lock-lease.test.ts, tests/system/board-inspection/support/package-process.ts, and tests/system/board-inspection/support/package-sentinel.ts. No broad process, system, repository, or browser suite ran. Acceptance criteria remain unchecked and task remains In Progress.

Spawn-boundary remediation completed against prior HEAD 6cfd7e887432b5368becc242905a898f25e078cc. At tests/system/support/owned-canvas.ts, startOwnedCanvas now builds each canvas child environment from inherited PATH, supplied explicit caller values, and the existing owned HOME, XDG_CONFIG_HOME, XDG_STATE_HOME, TMPDIR, PORT, HOST, ARCHBOARD_VAULT, and LOG_LEVEL values; it no longer spreads process.env. The existing namespace lifecycle owner now sets an ambient sentinel in the parent, observes the spawned child response, and proves the sentinel does not cross the spawn boundary while owned roots remain correct. Final focused validation through the required capped wrapper: bun test --isolate tests/system/support/owned-canvas.test.ts passed 10/10 with 67 assertions in unit archboard-task143-worker-command-KXdu7f2n.service; bun test --isolate tests/system/process-contracts/resource-cleanup.test.ts passed 8/8 with 76 assertions in unit archboard-task143-worker-command-DcHnW5h8.service; bun test --isolate tests/system/repository-policy/legacy-injection-removal.test.ts passed 2/2 with 5 assertions in unit archboard-task143-worker-command-xT9VJTza.service; focused Oxlint, Oxfmt --check, and git diff --check passed after the mechanical format fix in unit archboard-task143-worker-command-CMc6bNcD.service. bunx tsc --noEmit --pretty false remains red only on unrelated pre-existing files: src/runtime/engine/git-process-owner.ts, src/runtime/engine/git.ts, src/runtime/engine/tests/board-lock-lease.test.ts, tests/system/board-inspection/support/package-process.ts, and tests/system/board-inspection/support/package-sentinel.ts. No broad process/system/repository/browser suite ran. Acceptance criteria remain unchecked and task remains In Progress.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: 0e74cbaf is the strongest selective-replay candidate because it is a narrow cleanup above ba1aacee. Keep its head durably referenced, but do not replay or validate it until TASK-143.08.01 removes the OOM mechanism.
---
<!-- COMMENTS:END -->
