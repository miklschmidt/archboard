---
id: TASK-143.06.03
title: Delete the legacy app-server control client
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-09-03 02:20'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/engine/app-server-control.ts
  - tests/system/repository-policy/legacy-injection-removal.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm TASK-143.08.01 is Done at the exact finalized base and inventory all executable references to the retired control client, socket framing, and shared-daemon lookup.
2. Delete src/runtime/engine/app-server-control.ts and remove only the existing repository-policy exemption or stale production references needed to keep the control client absent and unreachable. Preserve historical ADR and research evidence.
3. Verify the source tree has one stdio Codex transport, no production control-socket references, and no stale imports or exports through focused repository-policy and type/module checks; record evidence without broad suites.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation and focused validation, 2026-09-03: deleted src/runtime/engine/app-server-control.ts. The existing legacy-removal repository owner now asserts the module is absent, scans src/server, src/runtime, and src/ui TypeScript/TSX, and rejects control-client paths, socket names, control constants/helpers, and ws+unix framing. Historical ADR/research references were preserved. Capped focused owners passed: legacy-injection-removal repository policy (2 tests), exact Codex stdio process owner (13 tests, 74 assertions), Oxfmt check, and Oxlint. Capped bun run type-check was attempted after frozen-lockfile install and remains red on 12 unrelated pre-existing errors in git-process-owner.ts, git.ts, board-lock-lease.test.ts, board-inspection package support, and related files; no error references this change.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: this cleanup may resume only after the OOM gate is Done; its focused validation must use the recovered bounded test path.
---
<!-- COMMENTS:END -->
