---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 17:03'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.07.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-coordinator
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one persistent current-epoch coordinator using the literal reviewed ThreadStartParams profile, exhaustive model selection, exact settings handshake, and restart/reuse policy. It remains capable under ordinary tools/approvals; sustained-work delegation is policy, not a capability restriction. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 model/list is fully exhausted and gpt-5.6-luna with medium effort is required; absence refuses. Priority is included only in the reviewed priority-capable profile when advertised, otherwise the fallback profile omits it and exposes configured/effective state.
- [ ] #2 Thread start exactly matches the authored coordinator profile: checkout cwd/sole runtime root, paginated persistence, startup/archboard source, composed instructions, realtime feature config, eager catalogues, model, and every intentional provider/approval/sandbox/permissions/personality/environment/experimental omission.
- [ ] #3 The one subsequent settings update and the matching settings-updated notification match the authored bytes; model/medium effort/tier are proven and captured approval/sandbox remain unchanged before reuse.
- [ ] #4 Only a matching loaded controllable current-epoch coordinator with reviewed hashes/settings is reusable; others are inspect-only or replaced through the staged transaction.
- [ ] #5 Normal web, shell, repository, approval, and bounded board capabilities remain available while instructions default sustained code work to delegation.
<!-- AC:END -->
