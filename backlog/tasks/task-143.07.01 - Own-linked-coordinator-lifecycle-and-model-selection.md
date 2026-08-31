---
id: TASK-143.07.01
title: Own linked coordinator lifecycle and model selection
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 15:50'
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
- [ ] #1 model/list is exhausted and gpt-5.6-luna with medium effort is required; absence refuses. Priority is included only when advertised, otherwise omitted with visible configured/effective state.
- [ ] #2 Thread start exactly matches the authored coordinator profile: checkout cwd/root, paginated persistence, startup/archboard source, instructions, realtime config, eager catalogues, model, and every intentional omission.
- [ ] #3 The one settings update and matching notification prove model, effort, and tier while preserving start-response approvalPolicy, approvalsReviewer, sandbox as notification sandboxPolicy, and activePermissionProfile; none is renamed permissions.
- [ ] #4 Only a matching loaded controllable current-epoch coordinator with reviewed hashes/settings is reusable; others are inspect-only or replaced through the staged transaction.
- [ ] #5 Normal web, shell, repository, approval, and bounded board capabilities remain available while instructions default sustained code work to delegation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile public session, epoch, thread-link, authored-instruction, and tool-catalogue contracts into a strict coordinator port with injected notification handling and no local identity synthesis.
2. Implement exhaustive model selection and the exact reviewed coordinator ThreadStartParams profile, followed by one settings update and a matching notification handshake that exposes configured/effective state while preserving approval, reviewer, sandbox, and permission-profile fields.
3. Implement current-epoch reuse/replacement policy: reuse only a loaded controllable matching thread; classify all other candidates as inspect-only or replace through one staged epoch transaction with deterministic lost-response/no-retry outcomes.
4. Add focused fake-port tests covering paging, model/priority decisions, exact start/settings contracts, stale and mismatched reuse, hash drift, replacement, transaction loss, and capability preservation.
5. Run only sequential transient 6G/1G focused validation plus scoped type/lint/format/diff checks, audit preserved work, commit the coherent change, and leave this task In Progress with acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->
