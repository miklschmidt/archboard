---
id: TASK-143.03.01
title: Connect the browser to the closed workbench contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-01 19:10'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-transport/lib/transport.ts
  - src/ui/workbench-transport/lib/wire.ts
  - src/ui/workbench-transport/tests/remediation-capabilities.test.ts
  - src/ui/workbench-transport/tests/remediation-second.test.ts
  - src/ui/workbench-transport/tests/shared-socket.test.ts
  - src/ui/codex-workbench-media/index.ts
  - src/ui/codex-workbench-media/lib/media-owner.ts
  - src/ui/canvas/useCanvasSession.ts
  - src/ui/canvas/workbench-socket.ts
  - src/ui/canvas/tests/workbench-socket.test.ts
  - src/ui/canvas/tests/pane-report-sequencing.test.ts
  - tests/system/canvas-state/codex-workbench-application-sockets.test.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect the browser to the closed workbench gateway produced by the final server composition root. Own transport/reconnect/sequence behavior only; never instantiate a process, session, coordinator, queue, approval, semantic, or realtime owner in the UI.

Delegation profile: gpt-daybreak-blue-latest, low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The client obtains one versioned full snapshot then applies strictly sequenced deltas from the production gateway; reconnect requests a new snapshot and never replays a command automatically.
- [ ] #2 Commands carry browser lease, pane, link, child epoch, and command identity and retain their original target across focus/navigation changes.
- [ ] #3 Stopped/backoff, initialized, storage mismatch, login-capable/signed-out/login pending, account-ready, thread-capable, reconnecting, stale snapshot, and incompatible-contract states are represented without enabling unsupported commands.
- [ ] #4 Transport tests use the final composed gateway public contract and prove duplicate/out-of-order messages, lost responses, late results, lease expiry, close, and recovery.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Sixth remediation plan (same-generation pane-report ordering, authorized canvas scope):

1. Add a monotonically increasing pane-report request identity scoped to each raw socket generation, allocated before every existing reportPane dispatch, and make only the newest relevant request authoritative for health, registration acknowledgement, and report freshness/failure state.
2. Preserve the one-shot attach latch, current raw socket/generation guards, debounce/settling, transport/media identity, one subscribe, no command replay, and close ownership; do not add another retry/status owner or report path.
3. Add behavior-level deferred-response regressions for newer-success/older-rejection, newer-success/older-negative, older-success-after-newer-failure, current failure/recovery, one attach/subscribe, and stale socket-generation isolation.
4. Make the real production socket owner retain the pre-registration gate coverage and verify superseded responses cannot affect its current transport.
5. Preserve all previously closed findings and leave acceptance criteria, task status, and final summary unchanged; run bounded canvas, production-socket, transport/media, policy, TypeScript, build, lint, format, and diff validation while omitting known aggregate OOM and serial-browser lanes.

Reopened remediation: carry authoritative candidate-list generation and identity through transport, expose one subscribable media snapshot with detailed voice phases and diagnostics, and bind semantic callbacks through the production transport. Preserve one socket, one subscribe, strict sequencing, and no command replay.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation (2026-09-01): addressed the review blockers within src/ui/workbench-transport. The browser transport now installs listeners before one subscribe handshake per socket generation; the subscribe response is the single versioned baseline, with shared-socket coverage proving the existing media owner remains on the same WebSocket. Open-socket requests use CODEX_REQUEST_SETTLEMENT_MS timers, remove and settle once as response_lost/outcome_unknown, ignore late responses, and clear timers on response, retirement, detach, and dispose. Command results must echo the frozen commandId before reconciliation; renew/release lease responses must preserve commandId, paneId, childId, and epoch. Wire ingress now uses the public shared browser model schemas for every snapshot and delta projection, then recursively clones/freezes DTOs before storage or exposure. Dynamic approval drafts validate identity and captured-link bindings before dispatch. Added focused hostile nested DTO, identity, immutability, readiness/link capability, stale-gap, lease lifecycle, and late-response regressions. Evidence: bun run type-check, bun run fmt:check, bunx oxlint src/ui/workbench-transport, and bun test --isolate src/ui/workbench-transport/tests all pass; 19 transport tests pass with 0 failures. The aggregate test:modules, test:repository, and repository boundary owner were previously attempted under the required 6G/1G bounded service and were OOM-killed; they were not retried.

Second remediation scope is deliberately limited to the public workbench transport, its wire/reducer tests, the directly-owned media owner/tests, and the existing production canvas-socket system owner. useCanvasSession remains unchanged: its raw socket is adapted into one transport by the media boundary only when no shared transport is supplied. Findings 2 (transport response settlement), 4 (strict wire/snapshot validation), and 5 (lease-target/result identity) remain preserved from the prior remediation.

Second remediation evidence (2026-09-01): bun test --isolate src/ui/workbench-transport/tests: 22 pass, 0 fail, 334 expect calls. bun test --isolate src/ui/codex-workbench-media/tests src/ui/workbench-transport/tests/shared-socket.test.ts: 6 pass, 0 fail, 30 expect calls. bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts: 2 pass, 0 fail, 21 expect calls, including one subscribe, transport-only media composition, backoff disposal, and media disposal leaving the real canvas socket open. bun test --isolate tests/system/repository-policy/codex-workbench-composition.test.ts tests/system/repository-policy/codex-dynamic-approval-contract.test.ts: 15 pass, 0 fail, 388 expect calls. bun run type-check, bun run fmt:check, and scoped bunx oxlint src/ui/codex-workbench-media src/ui/workbench-transport tests/system/canvas-state/codex-workbench-application-sockets.test.ts: all pass. Aggregate test:modules, test:repository, and the repository boundary owner remain intentionally unrun in this remediation because the prior required-bounds attempts were OOM-killed; no existing checks were weakened.

Third remediation started (2026-09-01): reviewer findings 1 and 7 require removing the raw-socket media overload and moving transport construction into the actual canvas socket composition. The public media owner will accept only BrowserWorkbenchTransport; useCanvasSession will retain one transport per WebSocket generation and remain the only socket close owner. The transport, media, and production system owners will verify one subscribe, one reducer, identity sharing, replacement/backoff recovery, late-frame isolation, and media disposal without socket close. Findings 2, 3, 4, 5, and 6 remain preserved; acceptance criteria and final summary stay unchanged.

Third remediation evidence (2026-09-01): removed the raw BrowserWorkbenchSocket media overload, the media-owned transport fallback, and attach_failed state; media now accepts only BrowserWorkbenchTransport and leaves transport retirement to the canvas socket owner. Added src/ui/canvas/workbench-socket.ts, which creates one transport per current WebSocket generation, passes that exact transport to media and the future transport accessor, retires old generations once, gates stale concurrent attaches, and never closes the canvas socket. useCanvasSession now delegates attach/detach/disposal to that owner and closes the raw socket only after owner disposal. Focused canvas/media/shared tests: bun test --isolate src/ui/canvas/tests/workbench-socket.test.ts src/ui/codex-workbench-media/tests src/ui/workbench-transport/tests/shared-socket.test.ts — 12 pass, 0 fail, 77 expect calls. Transport suite: bun test --isolate src/ui/workbench-transport/tests — 22 pass, 0 fail, 334 expect calls. Production canvas socket owner: bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts — 2 pass, 0 fail, 21 expect calls, including one subscribe/reducer, shared transport composition, replacement safety, and media disposal leaving the real socket open. Targeted policy owners: 15 pass, 0 fail, 388 expect calls. bun run type-check, bun run build, bun run lint, scoped oxlint, bun run fmt:check, and git diff --check pass. Aggregate test:modules, test:repository, repository boundary owner, and serial browser lane remain intentionally unrun because prior bounded attempts were OOM-killed or prerequisites were unavailable; no checks were weakened. Acceptance criteria remain unchecked and the task remains In Progress for parent review.

Fourth remediation (2026-09-01): finding 8 is fixed within the authorized canvas composition scope. Added one CanvasPaneRegistration promise per raw WebSocket generation, released only by the existing pane-report acknowledgement when registered=true. Registration failures clear the published report, publish the existing pane status as disconnected/recoverable, and leave the same gate pending for a later normal report; there is no private retry loop. The attach helper checks closed state, raw socket identity, generation, and registration identity immediately before the sole workbenchSockets.attach call. Close/replacement invalidates stale completions, and report responses from older generations cannot alter current registration, status, report freshness, or stale-build state. The raw canvas session remains the only socket-close owner.

Added focused runtime coverage for failed-registration recovery, stale-generation isolation, one subscribe, shared transport/media ownership, and no socket closure. The production socket owner now attaches its adapter before /api/panes registration, asserts zero subscribe before registration, then verifies registered=true, one subscribe, a ready snapshot, reducer/media behavior, and an open raw socket after owner disposal.

Fourth remediation evidence: bun test --isolate src/ui/canvas/tests — 38 pass, 0 fail, 181 expect calls; bun test --isolate src/ui/workbench-transport/tests src/ui/codex-workbench-media/tests — 29 pass, 0 fail, 364 expect calls; bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts — 2 pass, 0 fail, 23 expect calls; targeted composition and dynamic-approval policy owners — 15 pass, 0 fail, 388 expect calls; bun run type-check, bun run build, bun run lint, bun run fmt:check, and git diff --check pass. Aggregate test:modules, test:repository, repository-boundary owner, and serial browser lane remain intentionally unrun because prior bounded attempts were OOM-killed or prerequisites were unavailable; no checks were weakened. Acceptance criteria remain unchecked and the task remains In Progress for parent review.

Fifth remediation (2026-09-01): addressed review findings 1 and 2 within the authorized canvas composition scope. Pane registration now has two explicit responsibilities: the per-WebSocket-generation acknowledgement remains a one-shot attach latch, while updatePaneConnectionHealth independently applies every current authoritative pane-report result. A registered=true result after a prior failure restores connected=true/read/write status even when the attach latch already fired; a rejection or registered=false result remains visible as disconnected and does not reset the retained transport. Current socket identity and generation checks prevent stale responses from changing health, freshness, or attaching a replacement. No second attach, subscribe, command replay, timer, or transport reset was introduced.

The production canvas-socket owner now starts attachCanvasWorkbenchAfterRegistration before the real /api/panes POST. Its real WebSocket adapter proves the gate remains pending with zero subscribe through a failed acknowledgement, feeds the actual registered=true response, then verifies one attach, one subscribe, and a connected readiness snapshot. The same-generation latch is exercised again after attach and remains a no-op, while the retained transport/media path and open raw socket remain intact.

Fifth remediation evidence: bun test --isolate src/ui/canvas/tests — 38 pass, 0 fail, 181 expect calls; bun test --isolate src/ui/workbench-transport/tests src/ui/codex-workbench-media/tests — 29 pass, 0 fail, 364 expect calls; bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts — 2 pass, 0 fail, 23 expect calls; targeted composition and dynamic-approval policy owners — 15 pass, 0 fail, 388 expect calls; bun run type-check, bun run build, bun run lint, bun run fmt:check, and git diff --check pass. Aggregate test:modules, test:repository, repository-boundary owner, and serial browser lane remain intentionally unrun because prior bounded attempts were OOM-killed or prerequisites were unavailable; no checks were weakened. Acceptance criteria remain unchecked and the task remains In Progress for parent review.

Correction to fifth evidence counts (2026-09-01): the final canvas suite completed with 38 pass, 0 fail, 184 expect calls; the earlier 181-count line was from the pre-final assertion set.

Sixth remediation (2026-09-01): fixed same-generation pane-report response ordering within the authorized canvas composition scope. CanvasPaneReportSequencer assigns a monotonically increasing request identity before each existing reportPane dispatch and requires the latest request identity plus the current raw socket generation before settlement. The hook therefore lets only the newest relevant response update connected/read-only health, release the one-shot registration latch, clear or retain published report freshness, and publish stale-build state; older success, negative, and rejected responses are inert. Raw socket identity, registration identity, generation checks, debounce/settling, one attach/subscribe, transport/media identity, command non-replay, and socket-close ownership remain unchanged; no retry timer, status owner, or second report path was added.

Added behavior-level deferred-response regressions in pane-report-sequencing.test.ts for newer-success/older-rejection, newer-success/older-negative, older-success-after-newer-failure, later current recovery, success-failure-success health updates, one attach/subscribe, and stale socket-generation isolation. The real production canvas socket owner retains the pre-registration gate and now also proves a superseded same-generation response cannot disturb its retained transport.

Sixth remediation evidence: bun test --isolate src/ui/canvas/tests — 41 pass, 0 fail, 223 expect calls; bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts — 2 pass, 0 fail, 40 expect calls; bun test --isolate src/ui/workbench-transport/tests src/ui/codex-workbench-media/tests — 29 pass, 0 fail, 364 expect calls; targeted composition and dynamic-approval policy owners — 15 pass, 0 fail, 388 expect calls; bun run type-check (both TypeScript programs), bun run build, bun run lint, bun run fmt:check, and git diff --check pass. Aggregate test:modules, test:repository, repository-boundary owner, and serial browser lane remain intentionally omitted because prior bounded attempts were OOM-killed or prerequisites were unavailable; no checks were weakened. Acceptance criteria remain unchecked and the task remains In Progress for parent review.

Reopened with user approval after TASK-143.03.03 and TASK-143.04.01 showed missing list-generation identity and no public subscribable voice/media binding.
<!-- SECTION:NOTES:END -->
