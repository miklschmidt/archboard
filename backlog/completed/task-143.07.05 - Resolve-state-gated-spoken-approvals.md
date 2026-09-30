---
id: TASK-143.07.05
title: Resolve state-gated spoken approvals
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 18:29'
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
- [x] #1 The gate captures one eligible approval/effect plus child/epoch/coordinator/realtime identity and the effect-prompt item/sequence. It arms only after one later matching final user item; assistant, provisional, pre-prompt, duplicate, or stale items cannot arm.
- [x] #2 The module starts one ordinary coordinator turn containing the exact authored classifier bytes with the captured final user text; accept/decline text from realtime alone never settles the broker.
- [x] #3 Only a matching later item/tool/call for resolve_spoken_approval continues; host validation supplies ApprovalId after all child/thread/turn/call/manifest/session/item/sequence/effect/expiry checks.
- [x] #4 Ambiguity, missing user final, assistant-only response, changed effect, stale state, timeout, lost classifier/resolver, or child exit disarms to visual fallback and never remains awaiting_user.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the narrow spoken-approval gate contract in src/runtime/codex-spoken-approval: one immutable slot, host-supplied operation/message identities, captured broker binding and realtime/effect-prompt evidence, explicit fallback reasons, and the exact authored classifier template digest.
2. Implement the state reducer and event wiring for broker eligibility, realtime semantic transcripts, authoritative session notifications, dynamic resolve calls, epoch/child/coordinator/session/item/sequence/effect/expiry validation, and deterministic timeout/exit/disposal fallback.
3. Start exactly one ordinary coordinator turn after a later matching final user item using createTurnStartParams and the captured final text; accept only one matching resolve_spoken_approval call and settle the broker through its public resolver.
4. Add focused deterministic tests for arming gates, duplicate/provisional/assistant/pre-prompt/stale inputs, exact turn payload and one-attempt behavior, resolver identity checks, all fallback paths, and classifier/resolver races.
5. Run focused tests plus type-check, scoped lint/format, repository inventory/boundary checks, diff --check, and audit the protected frontend bundle without modifying it.

6. Bind arm-time effect-prompt evidence to the broker-derived immutable effect presentation, reject mismatches before classifier start, and add a fail-first public-gate regression while preserving exact-match behavior.

7. Remove the fixture-only TransportServerRequest export from the public transport root and type test support through the existing internal server-request contract without widening production API.

8. Re-run focused mismatch, type, lint, format, repository, module, and diff checks, preserve task state and protected files, then commit and report the complete remediation range for rereview.

9. Make omitted or null command approvals visual-only by requiring a cached broker-derived executable presentation, never falling back to reason, and audit command effect fields plus broader-grant gates before spoken classification.

10. Add fail-first broker and public-gate tests for decoded null and omitted command shapes, rerun focused broker/spoken, type, lint, format, module, and diff checks without repeating preserved repository-policy OOM lanes, then commit and report the complete fixed-base range.

11. Extend the broker remediation matrix with unsafe command, null or unsafe cwd, non-null environmentId, and non-null networkApprovalContext cases; assert unsupported_schema and absent cached presentation, keep one null/omitted public-gate integration case, then run focused validation and report a new fixed-base range.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review remediation applied: the approval broker now caches a frozen spokenEffectPresentation derived from the normalized command effect, and the public gate rejects both caller-summary and assistant-prompt mismatches as invalid_effect_prompt before any classifier turn. The generic TransportServerRequest export was removed from the transport root; spoken-approval fixtures use the existing internal server-request contract. Final focused evidence: approval and spoken-approval suites passed 29 tests with 207 assertions; TypeScript, scoped Oxlint, scoped Oxfmt, the full module lane, and git diff --check passed. The full repository lane and a two-owner boundary invocation reached the mandated 6G/1G cap after initial boundary owners emitted passing results and were not retried. Protected frontend bundle SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with acceptance criteria unchecked for independent rereview.

Remediation 2: the broker now caches a safe executable effect presentation at normalization and passes its availability into spoken eligibility. Missing or unsafe command text, cwd, execution-environment identity, or network approval context stays visual-only with unsupported_schema; the free-form reason is never used as a spoken effect fallback. Added broker regressions for decoded null and omitted command fields plus public spoken-gate regressions proving no classifier turn starts. Final scoped evidence: 38 focused approvals/spoken tests passed with 308 expectations; bunx tsc --noEmit passed; scoped oxlint passed; scoped oxfmt check passed; bun run test:modules passed. The preserved full repository-policy and boundary lanes were not rerun because their prior mandated 6G/1G cgroup OOM evidence remains unchanged.

Remediation 3: expanded the table-driven broker regression to cover null and omitted command, unsafe command text, null cwd, unsafe cwd, non-null environmentId, and non-null networkApprovalContext. Every case returns unsupported_schema from spoken eligibility and throws unsupported_schema when the cached spoken presentation is requested. Kept the single public-gate null/omitted integration case. Final focused evidence: 25 tests passed with 185 expectations; bunx tsc --noEmit, scoped Oxlint, and scoped Oxfmt checks passed. Known full repository-policy and boundary cgroup OOM lanes were not rerun.

Finalization evidence: independent reviewer 01a058e2-5cc0-7f42-87e5-892496fdb70f reported REVIEW_CLEAN for the complete implementation range 7e878e29b5dbb464ef12d72be0ca5db23c79efb3..59f101598b2cabcb47510fa31199c8f3c1f1b288. The complete focused approvals and spoken-approval suites passed 50 tests with 831 expectations. This proves AC #1 arming and identity capture, AC #2 exact classifier bytes and one ordinary turn, AC #3 matching resolver and host identity checks, and AC #4 fallback and one-shot behavior. TypeScript, scoped Oxlint, scoped Oxfmt, the module lane, and fixed-base git diff --check passed. Protected frontend bundle SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Known repository-policy and boundary lanes remain documented as mandated 6G/1G cgroup OOM and were not rerun. All four acceptance criteria are now checked; no Definition of Done items exist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and reviewed the state-gated spoken approval workflow, including exact classifier and resolver identity checks and fail-closed command-effect presentation. Verified by independent REVIEW_CLEAN on 7e878e29b5dbb464ef12d72be0ca5db23c79efb3..59f101598b2cabcb47510fa31199c8f3c1f1b288, 50 focused tests with 831 expectations, TypeScript, scoped Oxlint/Oxfmt, the module lane, and git diff --check. Protected bundle hash is unchanged; known capped-OOM lanes were preserved and not rerun.
<!-- SECTION:FINAL_SUMMARY:END -->
