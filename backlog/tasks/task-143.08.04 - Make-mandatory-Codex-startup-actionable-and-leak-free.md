---
id: TASK-143.08.04
title: Make mandatory Codex startup actionable and leak-free
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-03 04:05'
labels: []
dependencies:
  - TASK-143.08.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - src/server/canvas/lib/application.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/runtime/codex-process
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
- [ ] #1 ./bin/canvas start resolves only the exact package-local @openai/codex 0.151.0 runtime supplied by TASK-143.08.02 and starts one owned child before advertising the canvas.
- [ ] #2 Missing, wrong-version, non-file, unexecutable, verification-timeout, and early-child-exit cases each exit nonzero with one concise recovery message and no raw stack trace.
- [ ] #3 Every failed start leaves no HTTP listener, port owner, pidfile, child, process group, timer, epoch activation, gateway, queue, approval, realtime, or browser-workbench resource from that attempt.
- [ ] #4 A signed-out exact child starts successfully, exposes the account and sign-in state, and keeps thread-scoped actions disabled without treating authentication as startup failure.
- [ ] #5 Public-command and process-contract tests exercise success and every reachable failure through ./bin/canvas start, verify cleanup against exact attempt identities, and preserve pre-existing persistent Codex state.
- [ ] #6 Initial prepare, reload, concurrent start, child crash/backoff, serial restart, and shutdown process-census tests prove that an Archboard server never owns more than one live or starting codex app-server child or process group; reload never spawns a child, and restart begins only after the prior exact group has zero tasks.
- [ ] #7 This recovery task is the sole owner of Codex child startup, application phases, reload behavior, crash replacement, process reaping, teardown ordering, and failed-start cleanup. TASK-143.01.14 consumes its lifecycle interface and cannot add a second implementation of those behaviors.
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis at exact base 3f2f5ab49a2b7f10ff87798b9ed9b1a0fa29ca22: hiding only the package-local native Codex runtime makes ./bin/canvas start exit 3 after 8 seconds with a generic health-timeout message. The server log contains the real workbench failure; the foreground detached spawn discards it. Reverse application teardown removes listeners and the child, but createCanvasCodexWorkbenchInstallation has already created the workbench root. codex-process itself serializes group cleanup before backoff, while installCodexWorkbenchOwnerLifecycle turns every transport exit into terminal process.stop(), so production never consumes the safe replacement. The smallest resulting product keeps application lifetime as outer owner and codex-process as the only child/group owner; public startup observes those owners instead of adding a second supervisor.

Implemented the mandatory-start lifecycle on 2026-09-03. Public start now preflights the package-local runtime, observes the detached server, forwards one bounded refusal, and TERM/KILL-observes a failed server before returning. The server formats typed startup failures without stacks and resets attempt-local Codex wiring only after verified shutdown. Codex-process now distinguishes --version proof timeout and retains/reaps a post-spawn child whose group capture fails. The workbench keeps one process-child subscription, revokes dispatch on exit, cleans the retired graph, and activates only the replacement emitted after codex-process group cleanup. The real 0.151.0 signed-out handshake required accepting its omitted enabled-layer disabledReason field.

Focused evidence: 52 module/repository owners passed serially; all 8 production cleanup owners passed through ./bin/canvas start, including the six failure forms, two concurrent starts sharing one child, signed-out readiness/thread denial, reload no-respawn, and shutdown census. A bounded real-process crash probe observed old pid 2992884 gone before replacement pid 2992905 and exactly two generation spawns. Focused oxlint, oxfmt --check, and git diff --check passed. The pre-existing broad codex-workbench-production owner is not claimed as validation because it already fails at the unrelated threadLinkCreate expectation on the fixed base.

Review remediation opened at dd57c4d03418084fcdae1071cdfcdb8648b83d40. Valid findings: outer failed-start SIGKILL can preempt exact Codex group cleanup; recovery can hang when codex-process terminalizes before onChild; closing detached stderr after readiness can crash the server on a later log write; three process-contract mocks omit newly imported executable exports.

Standards/spec remediation: the detached launcher now gives fd 2 an independent sink and receives startup failure plus terminal-cleanup proof on a dedicated fd 3 record. Canvas lifetime publishes proof only after every entered resource stops successfully; failed-start force cannot SIGKILL the outer canvas before that proof, so the inner Codex owner remains alive through exact group TERM/KILL verification. Recovery acquisitions now subscribe to codex-process snapshots and convert terminal group-cleanup or replacement-spawn states into the exact failed acquisition before any next onChild; the retained owner remains inspectable while public dispatch stays revoked. Process-contract executable mocks now spread the actual module.

Remediation evidence: 27 focused canvas lifecycle/terminal module checks, 13 codex-process owner checks, 3 real group cleanup checks, 8 public production-cleanup checks, 3 HTTP lifetime checks, and 2 startup-signal checks passed. The force-boundary public owner took 18.73s with a 5.5s delayed graph and a TERM-resistant leader/descendant, then proved the exact canvas identity, both Codex start identities, and the whole process group absent. The logged-request owner proved HTTP 500 was written to the file log and /health remained live. Two composed process owners now pass the repaired mocks and reach the pre-existing unrelated threadLinkCreate not_delivered baseline; they are not claimed as green evidence.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:44
---
User decision, 2026-09-02: @openai/codex is a runtime dependency. One Archboard server may have only one live or starting codex app-server instance. Crash recovery is allowed only as a serialized replacement after the previous exact child and process group are completely gone.
---
<!-- COMMENTS:END -->
