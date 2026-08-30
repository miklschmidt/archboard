---
id: TASK-143.07.05
title: Resolve state-gated spoken approvals
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
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
Own the atomic spoken-approval gate and typed resolver in `src/runtime/codex-spoken-approval`. The later normal coordinator turn, not the realtime backing model, classifies a final reply; the host executes only a stored effect.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The immutable record includes shared approval identity, approvalId, child epoch, coordinator, realtime session, exact stored description, target state/effect hash, offered one-time decisions, and expiry; exactly one global slot may be pending.
- [ ] #2 The gate follows none -> presenting -> awaiting_user -> resolving -> terminal. `appendSpeech` speaks the stored description and awaiting_user begins only after the expected session-scoped final assistant transcript sequence; the uncorrelated 0.151.0 speech race remains explicit.
- [ ] #3 Only a later ordinary coordinator turn may call the typed `{approvalId, verdict: accept|decline}` resolver; coordinator-blocking requests, second requests, session grants, and policy amendments remain visual-only.
- [ ] #4 Compare-and-swap revalidates every identity/state before one stored effect executes; expiry, target change, realtime close, child/coordinator replacement, visual resolution, duplicate, early, ambiguous, or mismatched replies are inert.
<!-- AC:END -->
