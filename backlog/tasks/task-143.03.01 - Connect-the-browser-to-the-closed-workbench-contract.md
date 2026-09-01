---
id: TASK-143.03.01
title: Connect the browser to the closed workbench contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-01 15:52'
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
  - src/ui/codex-workbench-media/tests/media-owner.test.ts
  - tests/system/canvas-state/codex-workbench-application-sockets.test.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Connect the browser to the closed workbench gateway produced by the final server composition root. Own transport/reconnect/sequence behavior only; never instantiate a process, session, coordinator, queue, approval, semantic, or realtime owner in the UI.

Delegation profile: gpt-5.6-luna, max.
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
Second remediation plan (authorized cross-module scope):

1. Keep the workbench transport as the sole UI socket-level gateway owner and snapshot reducer. Add the shared pending dynamic-approval parser adapter and enforce exact lease usability at every command-specific capability/request boundary.
2. Refactor the media owner to consume the public workbench transport port for snapshots, leases, commands, and media readiness. For the existing raw-socket callsite, create the transport adapter at this boundary only; the media owner will not parse gateway frames, subscribe to the socket, or reduce snapshots.
3. Replace media and shared-socket tests with transport-port composition tests, including exact pending dynamic-approval identity/expiry rejection and lease-expiry no-request coverage.
4. Add the smallest real canvas-socket/gateway integration owner in tests/system to exercise the production seam, assert one subscribe per socket generation and one authoritative transport reducer, and prove media disposal does not close the canvas socket.
5. Run targeted module, media, production-boundary, type, lint, format, and repository-policy evidence; preserve reviewer-closed findings 2, 4, and 5 and leave acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation (2026-09-01): addressed the review blockers within src/ui/workbench-transport. The browser transport now installs listeners before one subscribe handshake per socket generation; the subscribe response is the single versioned baseline, with shared-socket coverage proving the existing media owner remains on the same WebSocket. Open-socket requests use CODEX_REQUEST_SETTLEMENT_MS timers, remove and settle once as response_lost/outcome_unknown, ignore late responses, and clear timers on response, retirement, detach, and dispose. Command results must echo the frozen commandId before reconciliation; renew/release lease responses must preserve commandId, paneId, childId, and epoch. Wire ingress now uses the public shared browser model schemas for every snapshot and delta projection, then recursively clones/freezes DTOs before storage or exposure. Dynamic approval drafts validate identity and captured-link bindings before dispatch. Added focused hostile nested DTO, identity, immutability, readiness/link capability, stale-gap, lease lifecycle, and late-response regressions. Evidence: bun run type-check, bun run fmt:check, bunx oxlint src/ui/workbench-transport, and bun test --isolate src/ui/workbench-transport/tests all pass; 19 transport tests pass with 0 failures. The aggregate test:modules, test:repository, and repository boundary owner were previously attempted under the required 6G/1G bounded service and were OOM-killed; they were not retried.

Second remediation scope is deliberately limited to the public workbench transport, its wire/reducer tests, the directly-owned media owner/tests, and the existing production canvas-socket system owner. useCanvasSession remains unchanged: its raw socket is adapted into one transport by the media boundary only when no shared transport is supplied. Findings 2 (transport response settlement), 4 (strict wire/snapshot validation), and 5 (lease-target/result identity) remain preserved from the prior remediation.

Second remediation evidence (2026-09-01): bun test --isolate src/ui/workbench-transport/tests: 22 pass, 0 fail, 334 expect calls. bun test --isolate src/ui/codex-workbench-media/tests src/ui/workbench-transport/tests/shared-socket.test.ts: 6 pass, 0 fail, 30 expect calls. bun test --isolate tests/system/canvas-state/codex-workbench-application-sockets.test.ts: 2 pass, 0 fail, 21 expect calls, including one subscribe, transport-only media composition, backoff disposal, and media disposal leaving the real canvas socket open. bun test --isolate tests/system/repository-policy/codex-workbench-composition.test.ts tests/system/repository-policy/codex-dynamic-approval-contract.test.ts: 15 pass, 0 fail, 388 expect calls. bun run type-check, bun run fmt:check, and scoped bunx oxlint src/ui/codex-workbench-media src/ui/workbench-transport tests/system/canvas-state/codex-workbench-application-sockets.test.ts: all pass. Aggregate test:modules, test:repository, and the repository boundary owner remain intentionally unrun in this remediation because the prior required-bounds attempts were OOM-killed; no existing checks were weakened.
<!-- SECTION:NOTES:END -->
