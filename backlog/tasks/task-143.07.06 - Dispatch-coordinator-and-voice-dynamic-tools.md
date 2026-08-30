---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.07.03
  - TASK-143.07.05
  - TASK-143.07.07
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
Own only coordinator `item/tool/call` validation and routing in `src/runtime/codex-coordinator-tools`. It consumes the persisted TASK-143.07.07 catalogue and dispatches to workhorse-operation and spoken-approval ports without redefining manifests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls must match the coordinator child/thread/turn/call identity and persisted catalogue hash; the host supplies workhorse/link/approval identity and rejects caller targets, unknown tools, self/cross-domain/prior-epoch state, and result media.
- [ ] #2 Every strict schema and result variant is imported from the catalogue; a dynamic effect needing speech returns approval_required before waiting so the classifier turn is never blocked.
- [ ] #3 Cancellation and lost dispatch responses preserve stable operation correlation and return one exact delivered, not_delivered, outcome_unknown, refusal, or approval_required result without duplicate mutation.
- [ ] #4 Real-process tests in src/runtime/codex-coordinator-tools/tests cover every catalogue route/refusal, manifest mismatch, coordinator-free spoken accept/decline, visual fallback, second-slot refusal, and separate canonical timelines.
<!-- AC:END -->
