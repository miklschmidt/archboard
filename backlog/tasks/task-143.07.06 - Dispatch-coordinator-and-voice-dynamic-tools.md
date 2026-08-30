---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
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
Own coordinator item/tool/call validation, routing, and response construction for reviewed workhorse/voice catalogues. It imports schemas/results and owns no app-server approval response. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls validate full coordinator logical identity/manifest; the host supplies workhorse/queue/approval identity and rejects caller targets or stale/self/cross-domain/prior-epoch state.
- [ ] #2 Workhorse tools route only to TASK-143.07.03. resolve_spoken_approval accepts only verdict and routes only after TASK-143.07.05 validates the sole final-user-derived pending broker identity.
- [ ] #3 This module alone constructs coordinator/voice dynamic-tool text responses; transport writes each once. Cancellation/lost dispatch cannot duplicate mutation or fabricate settlement.
- [ ] #4 Co-located fake-port tests cover every route/refusal/result, manifest mismatch, later classifier turn, visual fallback, final-user authority, second-slot refusal, stale session, and timelines; TASK-143.01.15 owns composed real-process coverage.
<!-- AC:END -->
