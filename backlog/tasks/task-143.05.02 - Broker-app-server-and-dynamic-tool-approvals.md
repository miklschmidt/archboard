---
id: TASK-143.05.02
title: Broker app-server and dynamic-tool approvals
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 13:35'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.06
  - TASK-143.01.08
  - TASK-143.05.01
  - TASK-143.01.16
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-approvals
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 185000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own compare-and-swap lifecycle, identity/effect validation, expiry, cancellation, and terminal response construction for all app-server human-interaction families. Dynamic dispatchers never construct approval responses.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A closed discriminated union covers command execution, file change, tool requestUserInput, MCP elicitation/openai form/URL, permissions, legacy applyPatchApproval, and legacy execCommandApproval using each real request/thread-or-conversation/turn-or-null/item/call/server/approval identity.
- [x] #2 The broker owns staged, pending, settled, expired, cancelled, stale, and outcome_unknown CAS state and revalidates child/epoch/link/target/effect immediately before one terminal response.
- [x] #3 Only this module constructs the seven human-interaction response variants; TASK-143.05.04 and TASK-143.07.06 alone construct their dynamic-tool responses, and TASK-143.01.06 alone writes supplied responses to the wire.
- [x] #4 Binary spoken eligibility excludes secrets, multi-question/forms/URLs, permission scopes, coordinator-blocking requests, unsupported schemas, stale ownership, and any broader grant; all remain visual.
- [x] #5 Tests cover accept/decline/cancel/validation, expiry, simultaneous requests, stale browser lease, effect change, child exit, late result, lost write, and exactly-once settlement for every family.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the completed protocol, transport, identity, timing, session, browser-model, and UI contracts plus existing approval seams, then define the closed request-family union and typed fake-port fixtures without changing those owners.
2. Implement one src/runtime/codex-approvals mediator that stages, CAS-transitions, validates, expires, cancels, and settles every required approval family, revalidating child/epoch/link/target/effect immediately before constructing exactly one terminal response.
3. Keep session-owned currentTime/token-refresh/attestation and dispatcher-owned dynamic-tool responses at their existing boundaries; make the mediator the only constructor for the seven approval response variants and retain dynamic tool responses in their dispatchers.
4. Add focused fake-port tests for each family and accept/decline/cancel/expiry/stale/effect-change/child-exit/late-write/exactly-once paths, including binary spoken eligibility exclusions.
5. Run sequential named systemd validation services with MemoryMax=6G and MemorySwapMax=1G, record evidence and risks, then commit the coherent scoped change for independent review without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation applied: explicit link:null now revokes captured/live ownership; browser and settlement use the same effective command decision set, with omitted/null defaulting to accept/decline/cancel and amendments accepted only when explicitly offered; host-forced cancellation/expiry bypasses visual offerings while emitting protocol-valid terminal responses; zero-wire local preparation failures classify as not_delivered. Added seven-family lifecycle and exact-payload coverage plus a deferred in-flight race covering delivered, not_delivered, and outcome_unknown with competing settlement callers. Focused validation: 28 tests, 711 assertions, type-check, lint, and format clean. Broad module/repository lanes remain capped-memory incomplete from the prior review.

Final transport-boundary remediation: real CodexTransportOwnershipError and CodexTransportUsageError rejections now classify as not_delivered after the single broker attempt; generic write errors remain outcome_unknown. Removed the classifier from the approval module root API. Added broker-level shared-settlement and no-retry assertions for both production error classes and the ambiguous case. Final focused validation: 28 tests, 728 assertions, type-check, lint, and format clean.

Finalization evidence: AC #1 is covered by the typed seven-family union and exact identity/payload tests; AC #2 by staged/pending/terminal CAS, immediate binding revalidation, child-exit, deferred-race, and exactly-once tests; AC #3 by scoped ownership review and the broker-to-transport response boundary tests; AC #4 by the spoken-eligibility exclusion matrix; AC #5 by the seven-family lifecycle matrix and 28-test focused suite. Both independent reviews are clean for e53d27a7deabf067b4aecf7a12655eececd06f8c..401975c4d556cf705e23d2f54f803ffc67badfaf. Residual risk: broad module/repository/browser lanes remain unrun or incomplete because prior capped attempts reached 6G.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and reviewed the Codex approval broker across all seven human-interaction families. The closed typed union preserves real identities; the broker owns staged/pending/terminal CAS, expiry, cancellation, stale binding checks, exactly-once settlement, and protocol-valid response construction; dynamic and session-owned responses remain outside it. Browser and settlement decision offerings share one effective command set, explicit link null revokes ownership, host-forced fallbacks bypass visual subsets safely, and transport ownership/usage errors classify as definite not-delivered while ambiguous writes remain outcome-unknown. Verified with 28 focused tests and 728 assertions, exact family payload/schema coverage, deferred in-flight races, type-check, lint, format, and two independent clean reviews for range e53d27a7deabf067b4aecf7a12655eececd06f8c..401975c4d556cf705e23d2f54f803ffc67badfaf. No Definition of Done items were defined. Broad capped/OOM-sensitive lanes remain a documented residual risk.
<!-- SECTION:FINAL_SUMMARY:END -->
