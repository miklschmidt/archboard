---
id: TASK-489
title: >-
  A claim is not lost while its agent is still writing, and a lost claim says
  why
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-17 04:20'
updated_date: '2026-10-17 04:38'
labels:
  - board-store
dependencies: []
priority: high
ordinal: 854000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-17 four agents, each claiming a different board of this vault on the server on port 3000, rebuilt stale proposals. Two of them (Agent workbench, Codex workhorse) were refused on their next write with CLAIM_REVOKED, "Somebody took ... back", about 8 minutes into a 2 h claim. Nobody used the take-back control, and the server had not restarted (it started at 01:59 UTC, the agents at 02:10 UTC). The take-back route is the only caller that revokes with a person, and noteClaimRevoked (src/runtime/engine/lib/board-lock-claim-state.ts) also records a revocation with no known taker when a lease renewal is refused. So the likely cause is a refused or missed renewal while several claims ran in one server. The agents stopped half way, as the skill tells them to, and an owner had to be asked.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A claimed board stays claimed for its whole duration while its holder writes, with several agents each claiming a different board on one server, shown by a test
- [ ] #2 When a claim does end without a person taking it back, the refusal names the cause (expiry, refused renewal, restart) instead of "Somebody took it back"
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce: several claims on one server, a pause longer than the claim lease (fake-timer stall in a module test; SIGSTOP of a real worktree server).
2. Fix renewal: a lease that lapsed while it still names the claim is renewed, not refused.
3. Fix the write under a claim whose lease lapsed before the late renewal ran: it joins the lease (since kept, not released after the write), still paying the steal guard.
4. Give ClaimRevocation a machine cause (taken-back, held-by-another, lease-gone) and carry it on every CLAIM_REVOKED answer (claim route, write and move refusals) with wording per cause.
5. Owners: src/runtime/engine/tests/board-claim-renewal.test.ts; cause assertions in the board-lock-api and cross-process-lock system tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: a claim's lease is 3 s and the server renews it every 1 s from a setInterval timer. A server that does one synchronous piece of work longer than about 2 s runs no timer meanwhile, so every claim lease whose last renewal was more than 3 s before the pause ended lapses. The late renewal then found its own lapsed lease, renewRecord refused anything not live, and noteClaimRevoked recorded a revocation with by = null, which refuseRevokedClaim words as 'Somebody took it back'. Which claims die depends on each renewal's phase against the pause, which matches two of four. A second path: a write under the claim that ran before the late renewal found the lease lapsed, took it as a fresh steal (created: true), and withBoardLock released it after the write, so the next renewal found no lease.
Evidence: (a) a module repro with real timers, four claims and a 2.6 s busy loop lost three of four claims with by = null; (b) on this worktree's server, four claims plus writes, then SIGSTOP for 3.5 s: all four next edits were refused CLAIM_REVOKED on the old source and all four landed under the fixed source; (c) ~/.local/state/archboard/archboard.log (CEST, UTC+2) shows CLI auto-start attempts at 127.0.0.1:3000 at 02:15:12, 02:15:36 and 02:18:52 UTC refused with 'already listening': a CLI auto-starts only when /health does not answer within 1500 ms, so the port-3000 server was unresponsive for over 1.5 s in the window the claims were lost (~02:18 UTC). What that server was doing synchronously is not in the log; the fix does not depend on it.
Fix: renewRecord renews a lapsed lease that still names the holder (nobody took it; the renewal was late). attempt() treats a claim's own lapsed lease as its own: since kept, created: false so the write does not release it, steal guard still paid. A lease another process took in the meantime still refuses renewal.
Cause on refusal: ClaimRevocation.cause is taken-back (a take-back on this server, or renewal found a person's take-back lease from another server), held-by-another (renewal found another writer's lease), or lease-gone (renewal found no lease). Every CLAIM_REVOKED answer carries cause, and the sentence opens with claimEndReason(): only taken-back names a person.
Decisions: expiry and restart produce no CLAIM_REVOKED today (an expired claim is dropped and the next write is ordinary; a restarted server has no memory of the claim and the CLI carries no claim id), so there is no refusal to name them. Telling expiry once would refuse the next writer of the board, whoever it is, and the claim route would refuse the natural re-claim; left for the parent to decide. Not closed: after a pause, an unclaimed write from another agent on the same server that runs before the late renewal can still steal the claim's lapsed lease; four agents on four boards cannot hit it.
Tests: src/runtime/engine/tests/board-claim-renewal.test.ts (both cases fail on the old code; the first also fails with only the renewal fix); board-lock-api.test.ts asserts cause taken-back; cross-process-lock.test.ts (opt-in topology) asserts lease-gone or taken-back.
<!-- SECTION:NOTES:END -->
