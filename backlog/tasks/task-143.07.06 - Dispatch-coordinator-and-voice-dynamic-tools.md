---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
labels: []
dependencies:
  - TASK-143.07.03
  - TASK-143.07.05
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tools
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 197000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the coordinator-specific manifests and `item/tool/call` routing in `src/runtime/codex-coordinator-tools`. This module binds schemas to the coordinator, workhorse-operations, and spoken-approval ports without exposing targets or a wait tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard_workhorse` contains exactly `inspect_workhorse`, `delegate_to_workhorse`, `manage_workhorse_queue`, and `steer_workhorse`; `archboard_voice` contains exactly `resolve_spoken_approval`.
- [ ] #2 The host supplies coordinator/workhorse/link identities and rejects caller-selected targets, unknown operations, self-targeting, prior epoch, cross-domain state, and unsupported result media.
- [ ] #3 A dynamic effect that needs spoken approval returns `approval_required` before waiting for speech so the classifier turn is never blocked.
- [ ] #4 Real-process tests cover exact manifests, every bound route/refusal, coordinator-free spoken accept/decline, blocked visual fallback, second-slot refusal, and separate canonical timelines.
<!-- AC:END -->
