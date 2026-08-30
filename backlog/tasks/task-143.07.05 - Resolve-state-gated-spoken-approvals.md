---
id: TASK-143.07.05
title: Resolve state-gated spoken approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 15:40'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.05.02
  - TASK-143.07.01
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
Own only voice-gate state and the broker identity for one spoken approval in `src/runtime/codex-spoken-approval`. The normal coordinator turn classifies a final reply; all effect response construction, target revalidation, and settlement execute through `src/runtime/codex-approvals` CAS.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The immutable gate record contains approval broker identity, approvalId, child/epoch, coordinator, realtime session, stored description, target/effect hash, one-time decisions, and expiry; one global slot may be pending.
- [ ] #2 The gate follows none -> presenting -> awaiting_user -> resolving -> terminal; appendSpeech speaks stored text and awaiting_user begins only after the matching canonical final assistant transcript item sequence.
- [ ] #3 Only a later ordinary coordinator turn may request {approvalId, verdict: accept|decline}; coordinator-blocking requests, second requests, session grants, policy amendments, and the uncorrelated speech race remain visual-only.
- [ ] #4 Resolution calls the approval broker CAS and mirrors its terminal outcome; expiry, target change, realtime close, replacement, visual resolution, duplicate, early, ambiguous, or mismatched replies never execute a local effect.
- [ ] #5 Tests in src/runtime/codex-spoken-approval/tests cover every gate transition and broker outcome without constructing a response or settling an effect in this module.
<!-- AC:END -->
