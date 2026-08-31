---
id: TASK-143.07.06
title: Dispatch coordinator and voice dynamic tools
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-08-31 21:35'
labels: []
dependencies:
  - TASK-143.07.03
  - TASK-143.07.05
  - TASK-143.07.07
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tools
  - src/runtime/codex-workhorse-operations
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
- [x] #1 Calls validate full coordinator logical identity/manifest; the host supplies workhorse/queue/approval identity and rejects caller targets or stale/self/cross-domain/prior-epoch state.
- [x] #2 Workhorse tools route only to TASK-143.07.03. resolve_spoken_approval accepts only verdict and routes only after TASK-143.07.05 validates the sole final-user-derived pending broker identity.
- [x] #3 This module alone constructs coordinator/voice dynamic-tool text responses; transport writes each once. Cancellation/lost dispatch cannot duplicate mutation or fabricate settlement.
- [x] #4 Co-located fake-port tests cover every route/refusal/result, manifest mismatch, later classifier turn, visual fallback, final-user authority, second-slot refusal, stale session, and timelines; TASK-143.01.15 owns composed real-process coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a narrow coordinator-tools contract for exact dynamic request identity/manifest validation, host-supplied coordinator/workhorse authority, the accepted workhorse-operations and spoken-approval ports, one-shot response transport, and lifecycle cancellation/child-disconnect hooks.
2. Implement strict request parsing and canonical closed text envelopes; classify current coordinator authority and route each reviewed workhorse tool only to CodexWorkhorseOperations, while routing resolve_spoken_approval only through CodexSpokenApprovalGate.
3. Serialize each request into one dispatch/response attempt, map accepted results and typed refusals without inventing settlement, and handle cancellation, lost dispatch, stale/current epoch, self/cross-domain, and manifest failures fail-closed.
4. Add co-located fake-port tests covering every namespace/tool route, schema/identity/manifest refusal, host authority race, workhorse result/refusal/unknown outcomes, later-turn and final-user-gated voice results, visual fallback, second slot, stale session, cancellation, child disconnect, duplicate response, and timeline ordering.
5. Run sequential named transient systemd validation with explicit cwd/cgroup and 6G/1G caps for focused tests, both type graphs, scoped lint/format, inventory, diff/clean/protected-hash checks; preserve known capped-OOM evidence, commit the coherent module, and leave acceptance criteria unchecked for independent review.

6. Replace the dispatcher string/request-derived response identity with the shared OperationAuthority: issue and validate one branded ID per workhorse call, pass it into every mutation request, reuse it for durable state/errors/results, issue read-result IDs without mutation state, and accept voice IDs only from the gate snapshot.

7. Add an optional host-issued OperationId to the .07.03 mutation request contract for compatibility, centralize validate-or-mint selection inside that module, and prove delegate, queue mutation, and steer reuse the exact supplied identity while rejecting cross-domain, unissued, and stale values before effect.

8. Claim full logical-call identity independently of wire request identity, reuse the first terminal result for a second request carrying the same call, and retain existing wire-request duplicate refusal with one effect and one response attempt.

9. Replace label-only spoken tests with full public SpokenApprovalSnapshot fixtures and add disposal timing owners that distinguish writable disposal from exact child disconnect.

10. Run only the requested focused coordinator/workhorse suites, both type graphs, scoped lint/format, inventory, fixed-range diff/clean/protected-hash checks in sequential named 6G/1G transient units; preserve all known capped-OOM lanes and leave acceptance criteria unchecked.

11. Separate logical effect ownership from per-wire settlement: cache the owner's canonical terminal result, let each admitted alias await it and attempt exactly one response on its own request, isolate alias cancellation, and cover concurrent/late aliases, write loss, per-wire failure, and child exit.

12. Hash a tool-specific canonical serialization of the closed validated input and require exact fingerprint equality before sharing a logical result; refuse mismatched aliases on their wire only.

13. Split replay storage into bounded live wires, compact terminal wire tombstones, live logical effects, and compact terminal logical results; cap aliases, evict stale current-call state, clear epoch state on child exit/dispose, and expose count-only inspection.

14. Add deterministic replay-capacity and lifecycle tests for normalized exact input, mismatched workhorse/queue/voice aliases, terminal outcomes, large queue text non-retention, bound overflow, cancellation/write loss, child exit/dispose, late retained aliases, and post-eviction no-effect refusal.

15. Retain the live-alias overflow refusal as a normal compact bounded wire tombstone, and prove same-object and copied-wire redispatch return that refusal without another write, effect, or owner-result adoption.

16. Replace spot fingerprint checks with a table-driven public-boundary matrix covering strict inspect/delegate/steer/voice inputs and exact/mismatched forms for all six queue variants, including reordered fields and multibyte text.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the coordinator-tools deep module with strict logical-call/manifest/epoch/host-binding validation, exact workhorse and spoken-gate routing, canonical one-item responses, and one-shot lifecycle/transport handling. Final focused evidence: archboard-task1430706-focused-final passed 19 tests / 232 expectations; archboard-task1430706-typecheck-final passed both TypeScript projects; archboard-task1430706-lint-final passed Oxlint with 0 warnings/errors; archboard-task1430706-fmt-final passed Oxfmt check; archboard-task1430706-inventory-final passed 39 tests / 69 expectations; git diff --check passed; protected bundle SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. The full test:modules lane was attempted once under archboard-task1430706-modules-final and reached the enforced MemoryMax=6G / MemorySwapMax=1G cap with a 6G memory and 1G swap peak; it was not retried. Task remains In Progress with acceptance criteria unchecked for independent review.

Remediation: coordinator now mints one canonical OperationId per workhorse dispatch, injects it through the TASK-143.07.03 mutation seam, and uses only the spoken classifier snapshot identity for voice settlement. Full logical-call correlation deduplicates retries across request IDs. Disposal closes admission without suppressing owned response writes; exact child disconnect remains the sole wire suppression condition. Regression coverage uses full public SpokenApprovalSnapshot fixtures and exercises pre-effect, in-flight read, in-flight mutation, and post-effect response delivery. Focused tests: 49 pass; both TypeScript graphs pass; scoped lint/format pass; test inventory: 39 pass. The previously observed capped test:modules OOM at MemoryMax=6G and MemorySwapMax=1G was not rerun. Acceptance criteria remain unchecked pending parent review.

Replay settlement remediation: logical execution and wire settlement now have separate owners. The first admitted call executes once and caches one canonical result; concurrent and late aliases each attempt one response on their own request ID without reminting an OperationId. Alias cancellation returns one isolated invalid_call refusal without cancelling the owner. Per-wire write loss is isolated, and exact child exit retires both wire owners without writes while the logical effect remains single. Final capped unit archboard-1430706-replay-final-gates: focused tests 53 pass / 412 expectations; both TypeScript graphs pass; scoped Oxlint 0 warnings/errors; scoped Oxfmt clean; inventory 39 pass / 69 expectations; peak 1.7G, swap 0B. Known capped-OOM lanes were not rerun. Task remains In Progress with acceptance criteria unchecked.

Replay identity/retention remediation: validated closed tool inputs now produce tool-specific canonical SHA-256 fingerprints; only byte-identical fingerprints share a logical result. Changed delegate text, queue arguments, and spoken verdicts receive alias-only invalid_call boundary refusals. Replay ownership is split into bounded live wires, compact terminal wire tombstones, live logical effects, and compact terminal logical responses. Limits are 8 concurrent aliases, 128 wire tombstones, and 32 logical terminals. Current-call changes evict stale logical state; child exit/dispose clear epoch state. Count-only replay inspection exposes no request/input/response bodies. Stress coverage drove 130 wire IDs through one 16 KiB queue prompt while retaining 128 tombstones, one 64-byte fingerprint, and one effect. Final capped unit archboard-1430706-retention-final-gates: focused tests 60 pass / 445 expectations; both TypeScript graphs pass; scoped Oxlint 0 warnings/errors; scoped Oxfmt clean; inventory 39 pass / 69 expectations; peak 1.8G, swap 0B. Known capped-OOM lanes were not rerun. Task remains In Progress with acceptance criteria unchecked.

Fourth remediation: live-alias overflow invalid_call refusals now enter the ordinary compact bounded wire tombstone path. Same-object and copied canonical-wire redispatch before and after owner settlement return the original overflow refusal with one transport write and one delegate effect; exact child-exit zero-write behavior remains covered. Added a table-driven public-boundary fingerprint matrix for inspect, delegate, steer, both spoken verdicts, and all six queue operations, covering reordered exact objects, changed canonical fields (including UTF-8), strict extra/null/default-like invalid inputs, one alias-only invalid_call response, stable OperationId/results for exact aliases, and zero additional effects. Final capped unit archboard-1430706-fingerprint-final-1: focused tests 71 pass / 800 expectations; both TypeScript graphs pass; scoped Oxlint 0 warnings/errors; scoped Oxfmt clean; peak 1.7G, swap 0B. Inventory unit: 39 pass / 69 expectations. git diff --check passed; source/test files remain under 500 lines; protected bundle SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Known capped-OOM lanes were not rerun. Task remains In Progress with all acceptance criteria unchecked for independent review.

Finalization evidence after independent REVIEW_CLEAN on 5842f4383bed569d876d0a05e747e551b49b74e9..d13a4cc403fd6b81d599cfac655e05f681476673: AC1 is proved by exact logical identity, manifest, epoch, host authority, and shared branded OperationId validation through the .07.03 seam. AC2 is proved by exhaustive dispatcher routing through CodexWorkhorseOperations and sole final-user-derived SpokenApprovalSnapshot gate authority. AC3 is proved by canonical response ownership, one effect per logical call, one settlement attempt per admitted wire, bounded fingerprint and tombstone replay, overflow replay, cancellation, write-loss, disposal, and exact child-exit tests. AC4 is proved by co-located fake-port coverage for every tool route, refusal, result, authority race, manifest mismatch, later classifier turn, visual fallback, final-user authority, second-slot refusal, stale session, and timeline. Accepted capped evidence: 71 focused tests / 800 expectations, both TypeScript graphs, scoped Oxlint and Oxfmt, repository inventory 39 tests / 69 expectations, clean fixed-range review, and unchanged protected hash. The prior full test:modules run reached MemoryMax=6G plus MemorySwapMax=1G and was not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed coordinator and voice dynamic-tool dispatch with strict identity and authority validation, shared OperationId continuity, exclusive workhorse and spoken-gate routing, canonical one-wire responses, and bounded deterministic replay. Independent review found no issues in the complete fixed-base range. Validation passed 71 focused tests with 800 expectations, both TypeScript graphs, scoped static checks, and the 39-test repository inventory; preserved capped-OOM evidence remains documented.
<!-- SECTION:FINAL_SUMMARY:END -->
