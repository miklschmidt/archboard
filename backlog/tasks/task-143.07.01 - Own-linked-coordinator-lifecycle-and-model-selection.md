---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:51'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.07.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one persistent coordinator per valid thread link plus global model/effort/service-tier/intervention settings in `src/runtime/codex-coordinator`. It starts a normal capable Codex thread; workhorse effects live in separate modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A valid pane/workhorse link starts exactly one persistent paginated coordinator at the workhorse's recorded cwd/runtimeWorkspaceRoot with reviewed instructions, TASK-143.07.07 dynamicTools, sessionStartSource startup, threadSource archboard, ephemeral/raw false, and ordinary inherited approval/sandbox settings.
- [ ] #2 After thread/start, one thread/settings/update sets validated gpt-5.6-luna, medium effort, and requested priority only when model/list advertises each; configured/effective values and fallback are read back and observable before the coordinator becomes reusable.
- [ ] #3 Start or settings failure leaves no active coordinator: a confirmed new thread is deleted when safe, otherwise recorded inspect-only; one same-epoch ready coordinator persists across voice stops and invalidates on child exit/rebind.
- [ ] #4 Coordinator instructions retain ordinary web/shell/repository investigation and one bounded board write; sustained mutation defaults to the workhorse, and read-only intervention policy defaults Explicit with Judgment/Never alternatives.
- [ ] #5 Tests in src/runtime/codex-coordinator/tests cover exact start/settings requests, unsupported model/effort/tier fallback, lost responses, partial cleanup, reuse, invalidation, and no attach-time persisted-tool mutation.
<!-- AC:END -->
