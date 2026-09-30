---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:07'
updated_date: '2026-09-04 02:19'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.16
  - TASK-143.01.21
  - TASK-143.08.05
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/codex-workbench
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the closed browser gateway for account and session readiness, thread links, timelines, settings, queue, ordinary and dynamic approvals, text commands, semantic status, and realtime control. The gateway leases commands and projects the distinct dynamic coordination approval DTO, but owns no Codex state reducer, approval policy, or mutation executor. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Browser state distinguishes child stopped or backoff, initialized, storage mismatch, login capable, signed out, login pending, account ready, thread capable, and reconnecting without enabling commands early.
- [x] #2 A renewable app-global command lease binds browser, pane, link, child epoch, and command id; navigation or focus changes do not retarget a pending ordinary or dynamic approval, and expiry produces one visible refusal.
- [x] #3 Account read, login, cancel, and logout are available before account readiness; all thread, turn, item, queue, tool, realtime, ordinary approval, and dynamic coordination approval operations require composed thread capability and the exact current link. Dynamic responses preserve OperationId, logical call identity, and effect hash.
- [x] #4 Reconnect snapshots and sequenced deltas are idempotent and bounded. Tests cover stale sequence, duplicate command, lost response, late result, lease transfer, dynamic approval expiry or disconnect, terminal approval_required without resume, child exit, browser close, and recovery.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the hand-set browser readiness field with one derived projection: a canvas-owned pure reducer over live owned-process, session, account, login, and coordinator facts that produces every AC #1 arm (stopped, backoff, storage_mismatch, incompatible_contract, reconnecting, initialized, login_capable, signed_out, login_pending, account_ready, thread_capable).
2. Feed that reducer from production: pass the owned CodexProcess snapshot into the gateway options, subscribe the gateway's lifecycle change source to the process so child-lifecycle transitions publish deltas, and notify projection listeners when session initialization settles the account.
3. Close the remaining hardcoded account and login projections: record account failure, login failure, login completion, and logout, and stop presenting one thread's queue after a link change.
4. Prove AC #1 in one focused canvas owner: the complete readiness matrix validated against the closed BrowserReadinessSchema, bounded contract-legal reasons from raw diagnostics, and the production adapter deriving readiness from its live owners.
5. Repair the branch's over-limit gateway test support file by splitting its pure builders into a sibling fixture.
6. Verify: type-check, lint, fmt:check, the codex-workbench and canvas module trees, test:repository, and the full test:modules lane.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation ready for independent review: childExit now makes the gateway terminal and recovery uses a newly constructed authority; wrapper arms are exact; in-flight and bounded settled command retention are separate and evicted IDs cannot execute. Focused gateway tests: 29 pass and 147 assertions. Backend and frontend TypeScript, scoped Oxlint, Oxfmt check, repository inventory, and diff checks pass. Acceptance criteria intentionally remain unchecked; task remains In Progress.

Async settlement remediation complete: disconnect owners now run independently after synchronous authority revocation, pending settlement promises are drained by browser close, exact child exit, and dispose, and lifecycle child-exit listeners are awaitable. Rejection policy is best effort after all owners receive a chance to settle. Final focused gateway suite: 36 pass and 197 assertions. Both TypeScript graphs, scoped Oxlint, Oxfmt check, repository inventory, and diff checks pass. Acceptance criteria remain unchecked and task remains In Progress.

Finalization evidence: AC #1 is proved by the closed readiness and capability-gate tests. AC #2 is proved by renewable app-global lease, exact link binding, non-retargetable approvals, and expiry or transfer tests. AC #3 is proved by account pre-readiness coverage, every route owner, exact capability and link checks, and preserved dynamic identity fields. AC #4 is proved by bounded snapshots, strict sequenced delivery, duplicate and stale handling, command retention, approval_required, disconnect, recovery, and lifecycle-drain tests. The complete BASE..HEAD range is review-clean. The documented combined repository-policy run remains preserved as capped-OOM and was not rerun.

Reopened with user approval after TASK-143.03.03, TASK-143.03.06, and TASK-143.03.07 exposed hardcoded or missing browser projections in the production gateway.

Live browser timeline producer implemented. A single canvas owner reads bounded typed thread-turn pages with full item view, obtains only the opaque timeline cursor from the session boundary, maps the seven reviewed presentation arms plus exact item-bound ordinary approvals, strips NULs, bounds text/cursors/items, and caches per pane/link/capability. Stale link loads are discarded; matching raw transport notifications are correlated through the trusted identity serializer; failed refreshes recover on a later matching event. The existing gateway projection receives the owner output and production lifecycle disposes it with the generation; no browser DTO builder, second reducer, or mutation path was added. Evidence: 70 focused tests and 435 assertions passed across timeline, gateway, projection, generation, recovery, and production-initialization owners; root and frontend TypeScript, scoped Oxlint/Oxfmt, repository boundary/inventory policy, and diff checks passed. No broad, browser, or full check lane ran. Acceptance criteria remain unchecked and the task remains In Progress.

Remediation implementation complete: the existing gateway notifyDisconnect seam now synchronously retires projection state with the exact browser connection identity, including replacement, close, child-exit, and shutdown paths; the canvas adapter passes that identity into timeline reads and retirement. The timeline owner projects and bounds each source turn during ingestion, retains only compact owner presentation data, requires the typed thread/timeline method pair, caps final approval-interleaved items, and enforces one bounded turn/item/byte budget (production ceiling 768 KiB, injectable tiny limits in focused owners). Focused remediation owners prove close-then-notify produces no retained read/publication, reject source inspection beyond a tiny item limit, use timeline/list's cursor, preserve matching approval chronology while omitting unmatched overflow, and stay within a 5 KiB aggregate budget. Evidence: 67 focused gateway/timeline/projection/generation tests and 407 assertions passed; 61 repository boundary/inventory tests and 132 assertions passed; both TypeScript graphs, scoped Oxlint/Oxfmt, and diff checks passed. No broad, browser, system, performance, or capacity lane ran. Acceptance criteria remain unchecked and task remains In Progress.

Hard-review remediation complete at the requested focused boundaries. Timeline state is now owned per pane and exact browser connection, so concurrent same-pane sockets load independently, every live pair observes correlated refreshes, and close retires only the named pair. One validated CanvasBrowserProjectionBudget now supplies both bounded timeline retention and the gateway's complete BrowserSnapshot limit; the gateway fits timeline history only after queue, ordinary approvals, dynamic approvals, semantic/coordinator, voice, lease, and operation fields are present, and rejects budgets below the 32 KiB base envelope. User-message summary scanning now propagates truncation when text lies beyond the 32-part scan. The canvas gateway timeline owner uses typed fixtures with no as-never or double-assertion bypasses; two unused test-support helpers were removed.\n\nVerification: 73 focused gateway/projection/timeline/generation/production-initialization tests passed with 463 assertions; both TypeScript projects passed; scoped Oxlint and Oxfmt passed; repository boundary and test-inventory owners passed 61 tests with 132 assertions; git diff --check passed. No broad, browser, system, stress, capacity, performance, tooling, topology, or concurrency lane ran. Remaining TASK-143.01.02 contract risk: non-timeline browser fields have no truncation semantics, so the gateway preserves them and rejects invalid_projection if they alone exceed the configured complete-snapshot budget. Acceptance criteria remain unchecked and TASK-143.01.10 remains In Progress for parent rereview.

Second hard-review remediation complete. Assertion-laundered generation and timeline fixtures were replaced with typed, discriminant-preserving builders; the target canvas gateway owner no longer mutates component fixtures through Object.assign. Explicit snapshot maxBytes values now reject every unsafe, nonintegral, below-minimum, or above-maximum value while omission retains the 768 KiB default. Complete-snapshot fitting can drop the final paginated timeline turn when that makes the full projection fit, retaining nextCursor as the truncation signal; non-timeline-only overflow remains a refusal. Same-pane coverage now proves one correlated notification refreshes both live connections before exact retirement, then only the survivor refreshes and recovers. The full 32 KiB budget owner includes timeline, queue, settings, ordinary and dynamic approvals, semantic delivery, voice transcript, active command lease, and delivered operation. Verification: 38 focused tests with 247 assertions passed; both TypeScript projects passed; scoped Oxlint and Oxfmt passed; repository boundary and test-inventory owners passed 61 tests with 132 assertions; git diff --check passed. No broad, browser, system, stress, capacity, performance, topology, or concurrency lane ran. Residual compatibility behavior is intentional: a lone timeline turn is removed only when a non-null nextCursor preserves a valid truncation indication; without that indication the existing refusal remains. Acceptance criteria remain unchecked and TASK-143.01.10 remains In Progress for parent rereview.

Reopened-scope implementation complete (@claude-opus).

What was still hardcoded or unproven in the production gateway, and what changed:

1. Readiness (AC #1). The canvas adapter kept one hand-set readiness field that only ever became initialized, signed_out, login_pending, or thread_capable. A browser could not distinguish a stopped or backing-off child, a refused storage home, an incompatible binary, a reconnecting session, a login-capable host, or an account that is ready before thread capability exists — all states the closed contract defines and the gateway already gates on, and all states TASK-143.03.03 AC #4 must render. Readiness is now derived, never stored: src/server/canvas/lib/codex-workbench-readiness.ts reduces the live owned-process facts (state, the app-server ready mark, restart attempt, next restart time, failure code) plus the account, login, and coordinator lifecycle onto exactly one contract arm, and bounds any diagnostic message into one contract-legal reason (no control characters, non-empty, at most 512 UTF-8 bytes). Production passes the owned CodexProcess snapshot in and subscribes the gateway's lifecycle change source to process.subscribe, so a child transition or a readiness mark publishes a delta with no browser command; session initialization notifies the projection listeners for the same reason.

2. Account and login projections. A failed account/read left stale account facts, a failed sign-in left login idle, a completed sign-in stayed pending forever, and logout left the login record behind. Each now records its real arm.

3. Queue targeting. The cached queue view carried no record of which workhorse thread produced it, so after an attach or relink a pane presented the previous thread's submissions. The cache now carries its workhorse thread id and a pane on any other link is told the queue is unavailable. A link mutation clears and re-reads it, because the closed browser command union owned by TASK-143.01.02 has no queue-list route the browser could call.

4. Sequenced delivery (AC #4). Nothing owned the gateway half: an owner change that alters nothing publishing no message, each observable change advancing the sequence by exactly one with only its changed fields, and a change too large for the 256 KiB delta bound escalating to a complete snapshot. One focused owner now proves all three plus a reconnect snapshot repeating the current sequence.

5. Dead contract surface. BrowserGatewayApplyResult, BrowserGatewayApplyStatus and BrowserGatewayClientState were exported but never produced or consumed; the browser transport owns delta application with its own status union. Removed rather than kept as a second owner.

6. Branch repair. The gateway test harness had grown past the 500-line oxlint limit for test-owned source, so bun run lint failed at the previous branch head. Its pure builders moved into a sibling fixture.

Verification (all from the worktree): bun run type-check pass (both TypeScript projects); bun run lint pass; bun run fmt:check pass; bun test src/server/canvas src/server/codex-workbench 147 pass 0 fail 829 assertions across 29 files; bun run test:repository 123 pass 0 fail 1074 assertions; bun run test:modules 1958 pass 0 fail 18588 assertions across 219 files. No system, serial-browser, or opt-in lane ran.

Deliberately out of scope: adding a queueList browser command (the closed model is TASK-143.01.02's); live thread/settings/updated workhorse settings (the workhorse owner tracks no live settings, so start facts remain the only source and effort stays null); coordinator activeTurnId and voice delivery (their owners expose no such fact, and TASK-143.04.x owns voice presentation).

Acceptance criteria remain unchecked and the task remains In Progress for reviewer verification.

Independent fixed-range review of 3bc86465..5968075f returned CLEAN.

Two minor review findings resolved:

Finding 2 (applied). The readiness reducer mapped binary_invalid, binary_wrong_version, and strict_config_rejected to incompatible_contract but let binary_missing fall through to stopped. All three binary_* codes are produced by the one verifyExecutable refusal in the process owner, and src/server/canvas/lib/startup-error.ts groups them identically, so binary_missing now reads as incompatible_contract too. The arm matrix owner in codex-workbench-browser-projection.test.ts now covers all four codes that reach that predicate.

Finding 1 (rejected, with evidence). The review read the accountLoginCancel reset of a login-pending account arm as unreachable. It is reachable: a successful accountLogin sets state.account to {kind: account, state: login_pending}, and cancel is the path that clears it. Deleting the block as suggested leaves the browser in login_pending with a stale loginId after a cancel, because state.login becomes cancelled while the account arm still decides readiness. Rather than delete correct code, the previously unproven behaviour now has an owner: 'cancelling a pending sign-in clears the login-pending account arm'. Removing the block makes that owner fail with Expected: "initialized" / Received: "login_pending". The readiness reducer's login_pending case carries a line naming where the arm comes from.

Final validation from the worktree: bun run type-check pass (both TypeScript projects); bun run lint pass; bun run fmt:check pass across 1052 files; bun test src/server/canvas src/server/codex-workbench 148 pass 0 fail 837 assertions across 29 files; bun run test:repository 123 pass 0 fail 1074 assertions across 18 files. The earlier full bun run test:modules run on this branch was 1958 pass 0 fail 18588 assertions across 219 files. No system, serial-browser, or opt-in lane ran.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: 8bac86bf is a Backlog-only blocker record with no unique product change. Fold its useful context into recovery and drop it after its head is durably referenced; it receives no replay.
---

author: @codex
created: 2026-09-03 23:44
---
Hard-review remediation is green at the requested focused boundaries; preparing the separate commit and parent rereview callback. The task remains In Progress.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The production Codex workbench browser gateway now projects real state instead of hand-set placeholders.

Readiness is derived, never stored: a new canvas reducer (src/server/canvas/lib/codex-workbench-readiness.ts) maps the live owned-process facts, the app-server ready mark, the account and login facts, and the coordinator lifecycle onto exactly one closed-contract arm, so a browser can finally distinguish a stopped or backing-off child, a refused storage home, an incompatible or missing binary, a reconnecting session, a login-capable host, and an account that is ready before thread capability exists. Production passes the owned CodexProcess snapshot in and binds the gateway's lifecycle change source to process.subscribe, so a child transition publishes a delta with no browser command. Account read failure, sign-in failure, sign-in completion, cancellation, and logout each record their real arm, and every projected reason is bounded to the contract's 512 UTF-8 bytes. Cached queue submissions now carry the workhorse thread they were read for, so a pane on another link is told the queue is unavailable rather than shown the previous thread's entries. Three exported gateway types that were never produced or consumed were removed, and the over-limit gateway test harness was split so lint passes again.

Verified: bun run type-check, bun run lint, and bun run fmt:check pass; bun test src/server/canvas src/server/codex-workbench 148 pass 0 fail across 29 files; bun run test:repository 123 pass 0 fail; bun run test:modules 1958 pass 0 fail across 219 files. AC #1 is proved by the readiness arm matrix, bounded-reason, live-owner derivation, and sign-in cancellation owners in codex-workbench-browser-projection.test.ts together with the gateway's command-gating owners; AC #2 and #3 by the lease, link, routing, and dynamic-identity owners in gateway.test.ts and gateway-command-owners.test.ts; AC #4 by the new sequenced-delivery.test.ts plus gateway-recovery.test.ts and snapshot-budget.test.ts. Independent fixed-range review of 3bc86465..5968075f returned CLEAN.
<!-- SECTION:FINAL_SUMMARY:END -->
