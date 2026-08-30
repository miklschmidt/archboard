---
id: TASK-143.07.05
title: Resolve state-gated spoken approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.05.02
  - TASK-143.07.01
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-spoken-approval
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one-slot spoken-approval compare-and-swap gate and schedule a later ordinary coordinator classifier turn. Realtime speech never directly returns a typed verdict.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gate captures the sole immutable eligible approval, effect fingerprint, child/epoch, coordinator/thread, realtime session, expected assistant transcript sequence, manifest hash, and expiry; a second request or coordinator-blocking request stays visual.
- [ ] #2 After the expected final assistant transcript, the module schedules one ordinary coordinator turn with the canonical classifier input; accept/decline text from realtime alone never settles the broker.
- [ ] #3 Only a matching later coordinator item/tool/call for resolve_spoken_approval may continue; host validation supplies the pending ApprovalId after child/thread/turn/call/namespace/tool/manifest/session/effect/expiry checks.
- [ ] #4 Ambiguous/missing transcript, changed effect, stale session/link/epoch, timeout, lost classifier/resolver response, or child exit disarms to visual fallback and never remains awaiting_user.
<!-- AC:END -->
