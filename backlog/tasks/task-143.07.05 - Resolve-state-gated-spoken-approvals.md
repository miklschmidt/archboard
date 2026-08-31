---
id: TASK-143.07.05
title: Resolve state-gated spoken approvals
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 16:39'
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
Own the one-slot spoken-approval gate and schedule a later ordinary coordinator classifier turn. Realtime speech never directly returns a typed verdict. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The gate captures one eligible approval/effect plus child/epoch/coordinator/realtime identity and the effect-prompt item/sequence. It arms only after one later matching final user item; assistant, provisional, pre-prompt, duplicate, or stale items cannot arm.
- [ ] #2 The module starts one ordinary coordinator turn containing the exact authored classifier bytes with the captured final user text; accept/decline text from realtime alone never settles the broker.
- [ ] #3 Only a matching later item/tool/call for resolve_spoken_approval continues; host validation supplies ApprovalId after all child/thread/turn/call/manifest/session/item/sequence/effect/expiry checks.
- [ ] #4 Ambiguity, missing user final, assistant-only response, changed effect, stale state, timeout, lost classifier/resolver, or child exit disarms to visual fallback and never remains awaiting_user.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the narrow spoken-approval gate contract in src/runtime/codex-spoken-approval: one immutable slot, host-supplied operation/message identities, captured broker binding and realtime/effect-prompt evidence, explicit fallback reasons, and the exact authored classifier template digest.
2. Implement the state reducer and event wiring for broker eligibility, realtime semantic transcripts, authoritative session notifications, dynamic resolve calls, epoch/child/coordinator/session/item/sequence/effect/expiry validation, and deterministic timeout/exit/disposal fallback.
3. Start exactly one ordinary coordinator turn after a later matching final user item using createTurnStartParams and the captured final text; accept only one matching resolve_spoken_approval call and settle the broker through its public resolver.
4. Add focused deterministic tests for arming gates, duplicate/provisional/assistant/pre-prompt/stale inputs, exact turn payload and one-attempt behavior, resolver identity checks, all fallback paths, and classifier/resolver races.
5. Run focused tests plus type-check, scoped lint/format, repository inventory/boundary checks, diff --check, and audit the protected frontend bundle without modifying it.
<!-- SECTION:PLAN:END -->
