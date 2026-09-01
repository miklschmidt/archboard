---
id: TASK-143.03.01
title: Connect the browser to the closed workbench contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-01 15:01'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-transport
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
1. Define a browser-only workbench transport port for the existing canvas WebSocket, with typed gateway envelopes, explicit connection/readiness/capability states, and no server/runtime owner imports.
2. Implement one connect/subscribe handshake per socket generation, strict versioned snapshot and delta reduction, stale/gap/incompatible handling, and explicit backoff/reconnect state without automatic socket creation or command replay.
3. Implement lease, account, and command calls against the exact gateway actions. Capture the current lease, pane, child epoch, and linked thread target at dispatch so focus/navigation changes cannot retarget an in-flight command; reconcile unsequenced results with a versioned snapshot request.
4. Settle lost commands as outcome_unknown, ignore late results from retired sockets, and make close, detach, replacement, lease expiry, and recovery visible and idempotent.
5. Add module tests using the final codex_workbench_request/result/event wire contract for handshake, strict sequencing, target capture, readiness capability gating, duplicate/out-of-order messages, lost and late results, lease expiry, close, and recovery.
6. Run focused transport tests, both TypeScript projects, scoped lint/format, repository inventory and boundary checks, then self-review, commit only the named transport module and task record, and callback the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation (2026-09-01): addressed the review blockers within src/ui/workbench-transport. The browser transport now installs listeners before one subscribe handshake per socket generation; the subscribe response is the single versioned baseline, with shared-socket coverage proving the existing media owner remains on the same WebSocket. Open-socket requests use CODEX_REQUEST_SETTLEMENT_MS timers, remove and settle once as response_lost/outcome_unknown, ignore late responses, and clear timers on response, retirement, detach, and dispose. Command results must echo the frozen commandId before reconciliation; renew/release lease responses must preserve commandId, paneId, childId, and epoch. Wire ingress now uses the public shared browser model schemas for every snapshot and delta projection, then recursively clones/freezes DTOs before storage or exposure. Dynamic approval drafts validate identity and captured-link bindings before dispatch. Added focused hostile nested DTO, identity, immutability, readiness/link capability, stale-gap, lease lifecycle, and late-response regressions. Evidence: bun run type-check, bun run fmt:check, bunx oxlint src/ui/workbench-transport, and bun test --isolate src/ui/workbench-transport/tests all pass; 19 transport tests pass with 0 failures. The aggregate test:modules, test:repository, and repository boundary owner were previously attempted under the required 6G/1G bounded service and were OOM-killed; they were not retried.
<!-- SECTION:NOTES:END -->
