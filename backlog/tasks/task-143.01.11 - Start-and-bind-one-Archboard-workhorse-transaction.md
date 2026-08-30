---
id: TASK-143.01.11
title: Start and bind one Archboard workhorse transaction
status: To Do
assignee: []
created_date: '2026-08-30 15:37'
updated_date: '2026-08-30 15:50'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-start
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one workhorse-start transaction in `src/runtime/codex-workhorse-start`. It composes the reviewed workhorse instructions and general dynamic-tool manifest, starts the thread, records the current app-server epoch, and binds the requesting pane through existing ports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The request requires one explicit absolute checkout root from the pane's existing checkout registry, uses it as cwd and sole runtimeWorkspaceRoot, and rejects missing, relative, stale, or ambiguous roots.
- [ ] #2 thread/start uses default dedicated-home model/approval/sandbox settings, persistent paginated history, sessionStartSource startup, threadSource archboard, ephemeral false, experimentalRawEvents false, byte-exact workhorse instructions, and the stable archboard_app manifest; all other optional overrides are omitted.
- [ ] #3 Success verifies the response, records child/epoch/thread plus cwd/manifest/instruction hashes, and binds the requesting pane before returning one executable link.
- [ ] #4 Any start, persistence, or bind failure compensates local state, deletes the new remote thread when confirmed safe, otherwise exposes it inspect-only, and never returns a partial executable link.
- [ ] #5 Tests in src/runtime/codex-workhorse-start/tests cover every exact request field, default preservation, success, partial/lost response, rollback, duplicate request, child replacement, and no recent-thread or cwd heuristic.
<!-- AC:END -->
