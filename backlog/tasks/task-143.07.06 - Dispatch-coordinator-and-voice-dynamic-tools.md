---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
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
Own coordinator item/tool/call validation, routing, and dynamic-tool response construction for the reviewed workhorse/voice catalogues. It imports schemas/results; it does not redefine them or construct app-server approvals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls validate coordinator child/epoch/thread/turn/call/namespace/tool/manifest hash and strict args; the host supplies workhorse/link/queue/approval identity and rejects caller targets, self/cross-domain/prior-epoch/stale states.
- [ ] #2 inspect/delegate/manage/steer route only to TASK-143.07.03; resolve_spoken_approval accepts exactly verdict accept or decline and routes only after TASK-143.07.05 returns the validated sole pending broker identity.
- [ ] #3 This module alone constructs coordinator/voice dynamic-tool text responses with canonical ok/refused/approval_required/outcome_unknown tags; TASK-143.01.06 writes each once.
- [ ] #4 Cancellation and lost dispatch preserve the stable logical call correlation and cannot duplicate mutation, fabricate settlement, or fall back from uncertain speech to awaiting_user.
- [ ] #5 Real-process tests cover every route/refusal/result, manifest mismatch, later ordinary classifier turn, visual fallback, second-slot refusal, stale session, and separate canonical timelines.
<!-- AC:END -->
