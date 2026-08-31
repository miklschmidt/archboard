---
id: TASK-143.02.05
title: Verify the realtime host and process contract
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-31 16:17'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.02.04
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/process-contracts/codex-realtime.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 242000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the real-process contract test for the runtime adapter and public browser module boundary. Browser device behavior remains in the controlled browser owner; this test drives an exact-version/fake stdio child through public ports.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The owner proves exact start parameters, empty response handling, SDP notification answer, started identity gate, item transcript reduction, paginated timeline recovery, and one-attempt append/stop behavior through public interfaces.
- [x] #2 Wrong child/thread/session/version, stale SDP, flat transcript, repeated cursor, lost append, child exit, and restart settle to the documented phase/outcome without duplicate transcript or retry.
- [x] #3 The fixture cannot import generated protocol files or media internals and leaves no child, listener, timer, request, or session after every success/failure case.
- [x] #4 The process-contract inventory registers this owner independently of browser tests and the clean real voice smoke.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create a disposable exact-version Codex app-server executable that validates the production argv, speaks newline-delimited JSON-RPC over stdio, records requests, and exposes deterministic control-file scenarios without importing generated protocol or media internals.
2. Build a process-contract harness through the public codex-process, codex-transport, codex-session, codex-realtime, shared identity, and shared realtime-host entrypoints; create one generation per child and dispose adapters/transports on exit and teardown.
3. Add focused owners for the exact start envelope, empty start response, SDP/started gates, item transcript reduction, paginated recovery, one-attempt append/stop, identity mismatches, stale gates, flat transcript, repeated cursor, lost append, child exit/restart, and duplicate/retry prevention.
4. Assert lifecycle cleanup after every success/failure scenario: no current child, closed transport with zero pending work, settled generation setup, disposed adapter, removed temporary roots, and no restart/backoff residue.
5. Run only the focused process owner plus repository inventory, scoped type/lint/format/diff checks under named transient systemd services with 6G/1G cgroup limits; leave acceptance unchecked pending review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the public-port process-contract owner and local exact-version fake app-server fixture. It covers start envelope/empty response, SDP and started gates, item transcript reduction, one-attempt append/speech/stop, identity/session/version/child rejection, stale SDP, flat transcript rejection, paged recovery, repeated cursor failure, lost append, child restart, no retry, and cleanup assertions. Focused owner, repository inventory, root typecheck, Oxlint, Oxfmt, and git diff checks pass; task remains In Progress with acceptance criteria unchecked pending review.

Remediated review findings on the same base: the fixture now records and gates the exact version probe before app-server spawn, supports a wrong-version terminal case, and delayed gate delivery keeps foreign/wrong-thread/wrong-session/wrong-version SDP/start notifications pending while asserting negotiating state. The owner compares the full canonical start policy including exact instructions and dynamic wire session identity, overlaps live and paged transcript item IDs, and asserts recovery_failed, lost-response/backoff, and restart states. Final focused and inventory validations pass; task remains In Progress with acceptance criteria unchecked.

Follow-up P1 remediation: identity-gate owners now send a matching current-child/current-thread/current-session started event before valid SDP and assert the offer remains negotiating/offer_created; restart coverage sends stale old-child SDP, then valid current-generation started, asserts still pending, then fresh SDP settles. Focused owner, final typecheck, lint, format, and diff checks pass; task remains In Progress with acceptance criteria unchecked.

Follow-up P1 remediation: extended makeNotification with independent child/epoch correlation overrides and added three invalid SDP cases—foreign child/current epoch, current child/foreign epoch, and current child/current epoch/wrong thread—before matching started, with exact pending negotiating/offer_created assertions. Preserved restart stale old-generation composite coverage. Focused owner, final typecheck, lint, format, and diff checks pass; task remains In Progress with acceptance criteria unchecked.

Final verification: the complete reviewed range 34a37f9d..7ba57092 passes the focused real-process owner (4 passed, 65 assertions), repository inventory (39 passed, 69 assertions), root TypeScript check, scoped Oxlint, scoped Oxfmt, and git diff --check. The owner exercises the exact start/command contract, independent child/epoch/thread/session/version gates, transcript reduction and recovery, one-attempt outcomes, restart/stale-generation behavior, and per-case process/transport cleanup. No browser or media lane was rerun because those remain outside this leaf's scope.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and verified the public-port Codex realtime process-contract owner and disposable exact-version fixture. All four acceptance criteria are satisfied by the focused owner, cleanup assertions, repository inventory, typecheck, lint, format, and diff validation. Task remains limited to test/fixture coverage; no production or protected bundle changes.
<!-- SECTION:FINAL_SUMMARY:END -->
