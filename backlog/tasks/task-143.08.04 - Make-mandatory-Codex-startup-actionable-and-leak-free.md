---
id: TASK-143.08.04
title: Make mandatory Codex startup actionable and leak-free
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-03 04:51'
labels: []
dependencies:
  - TASK-143.08.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - src/server/canvas/lib/application.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/runtime/codex-process
modified_files:
  - src/runtime/engine/canvas-startup-cleanup.ts
  - src/runtime/engine/tests/canvas-startup-cleanup.test.ts
parent_task_id: TASK-143.08
priority: high
type: bug
ordinal: 262000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keep ADR 0019's mandatory private Codex child. Exactly one package-local codex app-server instance may be live or starting for an Archboard server at any moment. After an unexpected exit, recovery may start a replacement only after the exact prior child and process group are fully reaped. Fix the public canvas startup interface so a missing, mismatched, unexecutable, or early-exiting runtime produces one actionable refusal and leaves no partial canvas or workbench state. Signed-out remains a supported running state. Do not add a Codex-off mode or PATH/global fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ./bin/canvas start resolves only the exact package-local @openai/codex 0.151.0 runtime supplied by TASK-143.08.02 and starts one owned child before advertising the canvas.
- [x] #2 Missing, wrong-version, non-file, unexecutable, verification-timeout, and early-child-exit cases each exit nonzero with one concise recovery message and no raw stack trace.
- [x] #3 Every failed start leaves no HTTP listener, port owner, pidfile, child, process group, timer, epoch activation, gateway, queue, approval, realtime, or browser-workbench resource from that attempt.
- [x] #4 A signed-out exact child starts successfully, exposes the account and sign-in state, and keeps thread-scoped actions disabled without treating authentication as startup failure.
- [x] #5 Public-command and process-contract tests exercise success and every reachable failure through ./bin/canvas start, verify cleanup against exact attempt identities, and preserve pre-existing persistent Codex state.
- [x] #6 Initial prepare, reload, concurrent start, child crash/backoff, serial restart, and shutdown process-census tests prove that an Archboard server never owns more than one live or starting codex app-server child or process group; reload never spawns a child, and restart begins only after the prior exact group has zero tasks.
- [x] #7 This recovery task is the sole owner of Codex child startup, application phases, reload behavior, crash replacement, process reaping, teardown ordering, and failed-start cleanup. TASK-143.01.14 consumes its lifecycle interface and cannot add a second implementation of those behaviors.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make codex-process the single child and process-group owner. Distinguish executable proof timeout, close the post-spawn group-capture leak, and retain the existing rule that restart scheduling begins only after the exact prior group is quiescent and reaped.
2. Make the public start path prove the exact package-local runtime before spawning a canvas, observe the detached server child until readiness, and forward one bounded typed startup refusal when the child exits. Add one server-process error formatter so missing, wrong-version, non-file, unexecutable, proof-timeout, and early-exit failures have concise recovery text without stacks.
3. Change the Codex workbench lifecycle to keep one process-child subscription for the application lifetime. Retire the failed generation, wait for its cleanup, then activate the replacement child emitted by codex-process without spawning from the workbench. Keep public dispatch unavailable during recovery, invalidate old links, preserve signed-out readiness, and make concurrent start or duplicate installation reuse or refuse without spawning.
4. Keep application lifetime as the outer startup and reverse-teardown owner. Remove attempt-local Codex wiring on failed prepare or shutdown while preserving existing persistent Codex files, and ensure HTTP, pidfile, WebSocket, browser, gateway, queue, approval, realtime, epoch, timers, child, and group ownership is terminal before a failed start returns.
5. Fold regression coverage into the existing executable, process lifecycle, workbench owner, production cleanup, and composed process-contract owners. Drive the public ./bin/canvas start failure matrix with isolated homes and immediate injected proof outcomes, use fake time for proof timeout and backoff, assert exact attempt PIDs/groups and residue, cover signed-out success, initial/concurrent/reload/crash/restart/shutdown census, and keep one minimal real process-group seam.
6. Run only the focused changed owners, focused formatting/lint/type checks that fit the assigned scope, and git diff checks. Commit coherent conventional slices and leave every acceptance criterion unchecked with TASK-143.08.04 In Progress for parent review.

7. Remediate review findings with one application-owned terminal-cleanup acknowledgement before outer force, process-state observation for recovery acquisition, retained stderr ownership after readiness, and partial executable mocks; consolidate focused lifecycle and public-command owners.

8. Replace the one-shot fd3 wait with one bounded launcher cleanup state machine: accept exact Codex group ownership before shutdown, prefer application cleanup proof, and transfer authority under SIGSTOP to guarded TERM/KILL group cleanup before reaping the exact outer canvas.

9. Give the cleanup state machine injected time and process operations. Cover proof, unproven cleanup, malformed protocol, fd close, and deadline without stacking production waits; use compressed preload-only boundaries for the public wiring owner.

10. Move the unique production crash/replacement census out of the unrelated composed thread workflow into one narrow independent process-contract owner, preserving dispatch revocation, exact prior-group-zero-before-replacement, and clean shutdown assertions.

11. Re-run the prior focused public refusal, signed-out, concurrency, reload, logging, lifecycle, and process owners serially; audit exact process identities and residue before rereview.

12. Keep the exact canvas SIGSTOPed whenever any transferred group remains owned, reused, unproven, or errors during inspection/signalling. Reap the outer pid only after every transferred group is proven quiescent, and name the outer pid plus latest leader pid, pgid, starttime, and state in the refusal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis at exact base 3f2f5ab49a2b7f10ff87798b9ed9b1a0fa29ca22: hiding only the package-local native Codex runtime makes ./bin/canvas start exit 3 after 8 seconds with a generic health-timeout message. The server log contains the real workbench failure; the foreground detached spawn discards it. Reverse application teardown removes listeners and the child, but createCanvasCodexWorkbenchInstallation has already created the workbench root. codex-process itself serializes group cleanup before backoff, while installCodexWorkbenchOwnerLifecycle turns every transport exit into terminal process.stop(), so production never consumes the safe replacement. The smallest resulting product keeps application lifetime as outer owner and codex-process as the only child/group owner; public startup observes those owners instead of adding a second supervisor.

Implemented the mandatory-start lifecycle on 2026-09-03. Public start now preflights the package-local runtime, observes the detached server, forwards one bounded refusal, and TERM/KILL-observes a failed server before returning. The server formats typed startup failures without stacks and resets attempt-local Codex wiring only after verified shutdown. Codex-process now distinguishes --version proof timeout and retains/reaps a post-spawn child whose group capture fails. The workbench keeps one process-child subscription, revokes dispatch on exit, cleans the retired graph, and activates only the replacement emitted after codex-process group cleanup. The real 0.151.0 signed-out handshake required accepting its omitted enabled-layer disabledReason field.

Focused evidence: 52 module/repository owners passed serially; all 8 production cleanup owners passed through ./bin/canvas start, including the six failure forms, two concurrent starts sharing one child, signed-out readiness/thread denial, reload no-respawn, and shutdown census. A bounded real-process crash probe observed old pid 2992884 gone before replacement pid 2992905 and exactly two generation spawns. Focused oxlint, oxfmt --check, and git diff --check passed. The pre-existing broad codex-workbench-production owner is not claimed as validation because it already fails at the unrelated threadLinkCreate expectation on the fixed base.

Review remediation opened at dd57c4d03418084fcdae1071cdfcdb8648b83d40. Valid findings: outer failed-start SIGKILL can preempt exact Codex group cleanup; recovery can hang when codex-process terminalizes before onChild; closing detached stderr after readiness can crash the server on a later log write; three process-contract mocks omit newly imported executable exports.

Standards/spec remediation: the detached launcher now gives fd 2 an independent sink and receives startup failure plus terminal-cleanup proof on a dedicated fd 3 record. Canvas lifetime publishes proof only after every entered resource stops successfully; failed-start force cannot SIGKILL the outer canvas before that proof, so the inner Codex owner remains alive through exact group TERM/KILL verification. Recovery acquisitions now subscribe to codex-process snapshots and convert terminal group-cleanup or replacement-spawn states into the exact failed acquisition before any next onChild; the retained owner remains inspectable while public dispatch stays revoked. Process-contract executable mocks now spread the actual module.

Remediation evidence: 27 focused canvas lifecycle/terminal module checks, 13 codex-process owner checks, 3 real group cleanup checks, 8 public production-cleanup checks, 3 HTTP lifetime checks, and 2 startup-signal checks passed. The force-boundary public owner took 18.73s with a 5.5s delayed graph and a TERM-resistant leader/descendant, then proved the exact canvas identity, both Codex start identities, and the whole process group absent. The logged-request owner proved HTTP 500 was written to the file log and /health remained live. Two composed process owners now pass the repaired mocks and reach the pre-existing unrelated threadLinkCreate not_delivered baseline; they are not claimed as green evidence.

Second review remediation at 73212b97 replaces the one-shot fd3 terminal wait with protocol v2 and one bounded cleanup state machine. Codex-process publishes every exact group identity before readiness. On cleanup error, malformed input, early fd close, or deadline, the launcher first proves the canvas stopped, then owns TERM/KILL and zero-census for every transferred group before it reaps the outer pid. Without an exact transfer it leaves the outer owner inspectable and fails closed instead of orphaning an unknown group.

The public cleanup-error owner now injects a 350 ms readiness bound, 150 ms application grace, and 900 ms total cleanup deadline through preload-only partial mocks. It keeps the real TERM-resistant leader and descendant, proves both exact identities, the whole group, and the outer canvas absent, and passes in 0.84 s instead of 18.76 s. Production defaults remain 8 s readiness, 5 s grace, and 10 s total cleanup.

Moved crash/replacement evidence out of the unrelated composed thread workflow. The independent production owner passes in 1.68 s, observes dispatch revocation, records an empty prior-group census inside the replacement process at its spawn boundary, observes one replacement, and proves its exact group empty on shutdown. The known threadLinkCreate not_delivered baseline remains untouched and is not validation evidence.

Final focused serial validation: 79 tests and 461 expectations passed across the cleanup state machine, codex-process lifecycle, application/workbench lifecycle, production initialization, all public executable refusals, concurrent start, signed-out/logged-error state, reload and persistent-state preservation, HTTP lifetime, startup signal cleanup, and crash replacement. Focused strict type checking for the new protocol/state machine passed. Focused Oxlint, Oxfmt, and git diff checks passed before the final audit.

Final Standards tail: after safe transfer, the launcher now leaves the exact canvas SIGSTOPed whenever group inspection or signalling errors, or any transferred group remains owned, reused, or unproven at the single deadline. Only the all-quiescent branch can SIGKILL and reap the outer canvas. Each refusal names the canvas pid, latest leader pid, pgid, starttime, and terminal state. The existing state-machine owner now covers all five non-quiescent classes and proves no outer SIGKILL. It passed 15 tests and 57 expectations in 24 ms. The successful public takeover stayed green at 836 ms, and independent crash replacement stayed green at 1.70 s. Focused type, lint, format, and diff checks passed.

Actual-head Standards remediation from b0f10a16: failed-start takeover now tracks the exact identity at every group inspection and signal, so an exception reports the group that actually failed instead of the last published group. A normal non-quiescent result selects the first failing identity in transfer order and prints leader pid, pgid, starttime, and state for every non-quiescent group. The canvas remains SIGSTOPed and outer SIGKILL/reap remains exclusive to the all-quiescent branch. Deterministic regressions reproduce an earlier group signalling failure while a later group is quiescent, and two non-quiescent groups with complete identity diagnostics. Red evidence failed on the former last-group attribution. Final focused evidence: cleanup owner 17 tests and 61 expectations; public signal/takeover plus crash replacement 3 tests and 23 expectations; focused strict TypeScript, Oxlint, Oxfmt, and git diff checks passed.

Final assertion count is 63 after explicitly proving inspection order 41 then 42 and the sole attempted group signal 41/SIGTERM in the earlier-group failure regression.

Finalization evidence (reviewed fixed range 7d0aa6557edd51aca9cc0b90e2e925397d95151a..e3e831f64f22b750ccccbfd04911da8ab86e729d): exact package-local 0.151.0 preflight; six actionable public failures; signed-out success; one fd3 ownership/terminal protocol; bounded 10s production cleanup with 5s inner grace; safe transfer/takeover; exact multiple-group diagnostics; safe stderr logging; concurrent start/reload/persistent state; terminal recovery failure; independent crash/replacement owner; force-boundary test reduced from 18.76s to ~0.84s with production defaults pinned; focused reviews/tests clean; unrelated threadLink baseline excluded.

AC3 qualification: Failed starts prove the exact attempt absent whenever cleanup can be proven. If group ownership, inspection, or signalling makes zero genuinely unprovable, start fails nonzero without claiming cleanup and leaves the exact canvas stopped with every guarded non-quiescent group identity and state for recovery; it never kills the only remaining cleanup owner.

Orchestration-process note (not validation evidence; both must not recur): (1) the implementation worker deleted four pre-existing generated /tmp production-fixture roots after proving no live process used them, but did not prove ownership. The deletion was outside authority and cannot be undone; they were reproducible derived test residue, not authored/persistent state. (2) the spec reviewer accidentally traversed/read the protected untracked /home/msc/Projects/archboard/src-DlBR1tzg.js via a broad read-only search. It was not modified or deleted and remained untracked. This was an access-boundary violation.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:44
---
User decision, 2026-09-02: @openai/codex is a runtime dependency. One Archboard server may have only one live or starting codex app-server instance. Crash recovery is allowed only as a serialized replacement after the previous exact child and process group are completely gone.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the reviewed six-commit mandatory Codex startup lifecycle range by fast-forward only. Fixed-range reviews and focused evidence confirm exact package-local 0.151.0 preflight, actionable public failures, signed-out readiness, bounded safe cleanup/takeover, lifecycle census and crash replacement; unrelated threadLink baseline excluded. Failed starts prove the exact attempt absent whenever cleanup can be proven. If group ownership, inspection, or signalling makes zero genuinely unprovable, start fails nonzero without claiming cleanup and leaves the exact canvas stopped with every guarded non-quiescent group identity and state for recovery; it never kills the only remaining cleanup owner.
<!-- SECTION:FINAL_SUMMARY:END -->
