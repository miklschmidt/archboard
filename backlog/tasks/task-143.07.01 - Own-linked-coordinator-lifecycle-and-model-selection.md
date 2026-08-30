---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.05
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
Own one persistent current-epoch coordinator, exhaustive model selection, exact settings handshake, and restart/reuse policy. It remains capable under ordinary Codex tools/approvals; delegation is the default for sustained work, not a capability restriction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 model/list is fully paginated and gpt-5.6-luna with medium reasoning is required; absence refuses coordinator creation rather than choosing another model silently.
- [ ] #2 Priority service tier is requested only when the selected model advertises it; otherwise the field is omitted and configured versus effective tier/fallback is inspectable.
- [ ] #3 Thread start supplies exact cwd/history/source/instruction/catalogue fields once, then one settings/update; the empty settings response is insufficient until matching settings-updated proves model, medium effort, effective tier, and unchanged approval/sandbox.
- [ ] #4 Only a matching loaded controllable current-epoch coordinator with reviewed instruction/manifest hashes and confirmed settings is reusable; all other rows are inspect-only or replaced through the staged transaction.
- [ ] #5 The coordinator keeps normal web, shell, repository, approval, and bounded board capabilities while its instructions make quick investigation/direct unambiguous board action available and sustained code work default to delegation.
<!-- AC:END -->
