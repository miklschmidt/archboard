---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-08-31 20:33'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a narrow coordinator-tools contract for exact dynamic request identity/manifest validation, host-supplied coordinator/workhorse authority, the accepted workhorse-operations and spoken-approval ports, one-shot response transport, and lifecycle cancellation/child-disconnect hooks.
2. Implement strict request parsing and canonical closed text envelopes; classify current coordinator authority and route each reviewed workhorse tool only to CodexWorkhorseOperations, while routing resolve_spoken_approval only through CodexSpokenApprovalGate.
3. Serialize each request into one dispatch/response attempt, map accepted results and typed refusals without inventing settlement, and handle cancellation, lost dispatch, stale/current epoch, self/cross-domain, and manifest failures fail-closed.
4. Add co-located fake-port tests covering every namespace/tool route, schema/identity/manifest refusal, host authority race, workhorse result/refusal/unknown outcomes, later-turn and final-user-gated voice results, visual fallback, second slot, stale session, cancellation, child disconnect, duplicate response, and timeline ordering.
5. Run sequential named transient systemd validation with explicit cwd/cgroup and 6G/1G caps for focused tests, both type graphs, scoped lint/format, inventory, diff/clean/protected-hash checks; preserve known capped-OOM evidence, commit the coherent module, and leave acceptance criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the coordinator-tools deep module with strict logical-call/manifest/epoch/host-binding validation, exact workhorse and spoken-gate routing, canonical one-item responses, and one-shot lifecycle/transport handling. Final focused evidence: archboard-task1430706-focused-final passed 19 tests / 232 expectations; archboard-task1430706-typecheck-final passed both TypeScript projects; archboard-task1430706-lint-final passed Oxlint with 0 warnings/errors; archboard-task1430706-fmt-final passed Oxfmt check; archboard-task1430706-inventory-final passed 39 tests / 69 expectations; git diff --check passed; protected bundle SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. The full test:modules lane was attempted once under archboard-task1430706-modules-final and reached the enforced MemoryMax=6G / MemorySwapMax=1G cap with a 6G memory and 1G swap peak; it was not retried. Task remains In Progress with acceptance criteria unchecked for independent review.
<!-- SECTION:NOTES:END -->
