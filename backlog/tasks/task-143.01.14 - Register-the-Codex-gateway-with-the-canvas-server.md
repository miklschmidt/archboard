---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-09-01 01:57'
labels: []
dependencies:
  - TASK-143.01.10
  - TASK-143.01.11
  - TASK-143.02.03
  - TASK-143.05.04
  - TASK-143.06.02
  - TASK-143.07.04
  - TASK-143.07.06
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - >-
    backlog/tasks/task-143.01.14 -
    Register-the-Codex-gateway-with-the-canvas-server.md
  - src/runtime/codex-approvals/lib/broker.ts
  - src/runtime/codex-approvals/lib/contract.ts
  - src/runtime/codex-approvals/tests/listener-ownership.test.ts
  - src/runtime/codex-dynamic-tools/index.ts
  - src/runtime/codex-dynamic-tools/lib/contract.ts
  - src/runtime/codex-process/lib/process.ts
  - src/runtime/codex-protocol/lib/config-schemas.ts
  - src/runtime/codex-protocol/tests/config-layers.test.ts
  - src/runtime/codex-realtime/index.ts
  - src/runtime/codex-realtime/lib/adapter.ts
  - src/runtime/codex-realtime/lib/contract.ts
  - src/runtime/codex-realtime/tests/adapter-races.test.ts
  - src/runtime/codex-realtime/tests/adapter.test.ts
  - src/runtime/codex-session/index.ts
  - src/runtime/codex-session/lib/contract.ts
  - src/runtime/codex-session/lib/session.ts
  - src/runtime/codex-session/tests/session.test.ts
  - src/runtime/codex-session/tests/support.ts
  - src/runtime/codex-thread-context/index.ts
  - src/runtime/codex-thread-context/lib/contract.ts
  - src/runtime/codex-thread-context/lib/controller.ts
  - src/runtime/codex-thread-context/lib/delivery.ts
  - src/runtime/codex-thread-context/tests/controller.test.ts
  - src/runtime/codex-thread-context/tests/delivery-support.ts
  - src/runtime/codex-workhorse-operations/tests/queue-support.ts
  - src/runtime/codex-workhorse-queue/lib/contract.ts
  - src/runtime/codex-workhorse-queue/lib/queue.ts
  - src/runtime/codex-workhorse-queue/tests/queue.test.ts
  - src/runtime/codex-workhorse-queue/tests/shutdown.test.ts
  - src/server/canvas/codex-workbench-adapters.ts
  - src/server/canvas/codex-workbench-application.ts
  - src/server/canvas/codex-workbench-browser.ts
  - src/server/canvas/codex-workbench-generation.ts
  - src/server/canvas/codex-workbench-owner.ts
  - src/server/canvas/codex-workbench-production.ts
  - src/server/canvas/codex-workbench.ts
  - src/server/canvas/lib/application.ts
  - src/server/canvas/lib/codex-workbench-adapters.ts
  - src/server/canvas/lib/codex-workbench-application.ts
  - src/server/canvas/lib/codex-workbench-browser.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/server/canvas/lib/codex-workbench.ts
  - src/server/canvas/tests/codex-workbench-adapters.test.ts
  - src/server/canvas/tests/codex-workbench-application.test.ts
  - src/server/canvas/tests/codex-workbench-browser.test.ts
  - src/server/canvas/tests/codex-workbench-generation.test.ts
  - src/server/canvas/tests/codex-workbench.test.ts
  - src/server/codex-workbench/lib/contract.ts
  - src/server/codex-workbench/lib/gateway.ts
  - src/server/codex-workbench/tests/gateway-command-owners.test.ts
  - src/shared/timing/timing.ts
  - tests/system/process-contracts/fixtures/codex-realtime-process.ts
  - tests/system/repository-policy/codex-workbench-composition.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one production composition root in the canvas server. It instantiates every accepted runtime port and dynamic approval, authority, context, operation-ID, and lifecycle adapter once, routes every server request exhaustively, supplies replaceable closures to kept state, and registers the closed browser contract. It contains no protocol reducer, approval lookalike, identity minting rule, or target-selection policy. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The composition instantiates process, identity and OperationId authority, epoch and session, workhorse transaction, realtime, seven-family approval broker, general dispatcher with all five injected adapters, coordinator dispatcher, semantic delivery, coordinator, queue, callbacks, spoken gate, and browser gateway exactly once.
- [ ] #2 One exhaustive router handles all eleven generated server request variants: seven broker families, item/tool/call, currentTime/read, token refresh, and attestation. Each reaches its sole owner or reviewed protocol error, dynamic approval never enters the seven-family broker, and no default branch responds generically.
- [ ] #3 kept() stores only version-neutral serializable state, stable process handles, and replaceable closures; no generation-bound class instance, decoder, route handler, callback, approval decision, effect authority, or UI adapter survives reload.
- [ ] #4 Startup installs identity decoders, dynamic dispatcher registrations, lifecycle signals, router, approval projection, and browser gateway before readiness. Shutdown stops browser, realtime, and queue, cancels dynamic approvals and waits, settles ordinary requests, closes JSON-RPC, TERM or KILLs the child, and removes listeners; browser disconnect and child exit cannot leave resumable authority, and duplicate owner registration refuses.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the broad canvas-index export and add one narrow production entrypoint imported only by the canvas application. Wire start before HTTP readiness and exact async shutdown into the existing signal path.
2. Refactor transport/session/approval ownership so the composed workbench installs the sole eleven-variant reverse-request listener. Keep standalone auto-registration only through an explicit supported option and prove one receive/respond attempt per family with real constructors.
3. Redesign retained ownership around one stable child/transport boundary. Reload replaces generation-bound listeners and owners without closing stdin; terminal shutdown closes transport and process once. Reject every duplicate active install and release registration only after failure, child exit, or shutdown.
4. Replace ad hoc teardown with a staged cleanup ledger active before the first constructor. Use it for constructor, registration, hook, initialization, child-exit, browser-disconnect, reload, and shutdown paths so every acquired owner retires even when another cleanup step fails.
5. Add direct application, real-factory routing, two-generation reload, failure-injection, child-exit race, duplicate-owner, and stable policy tests. Remove source-regex tests that duplicate behavioral proof.
6. Run the requested capped sequential validation lanes, including one fresh hot-reload owner after removing the eager import, then update task notes without checking AC and commit on top of 8de971a0 for independent fixed-base review.

7. Add the approved process-lifetime unbound binding controller in src/runtime/codex-thread-context. Preserve the immutable fixed-target leaf, own one subscription and one child/session event ledger across exact CAS bind/rebind/clear transitions, and integrate its proven workhorse binding into production composition before application readiness.

8. Implement the concrete canvas host owner in the application seam: one semantic publisher/context source, dynamic visual-approval owner, exact caller/target/context/operation/lifecycle adapters, browser projection/actions, and reviewed runtime bindings. Dynamically install the narrow workbench entrypoint before HTTP listen, replace only hooks on reload, and await exact shutdown/failure cleanup.

9. Add direct production-application owners for construction cardinality, readiness ordering, sole routing, reload identity, shutdown/child-exit/startup-failure cleanup, and duplicate refusal; then run capped validation and callback the fixed-base parent.

10. Wire the concrete Codex browser protocol through the existing canvas WebSocket connection owner. Decode connect, snapshot, lease, command, and subscribe requests at the application boundary; send gateway messages on that socket; retire the exact browser/pane connection on close and reload; and prove the public socket workflow including approval resolution.

11. Replace browser-authored turn payloads with codex-instructions constructors using the lease-bound pane, child, epoch, thread link, operation identity, board, and semantic context. Bind semantic delivery through exact CAS on create, attach, relink, stale disconnect, and child exit without selecting a fallback pane.

12. Add the smallest queue lifecycle authority needed to gate new work, cancel or drain accepted work, and revoke binding authority during shutdown and child exit. Bind realtime remote media to the authoritative browser connection and return the existing explicit unavailable result when no media owner is attached.

13. Replace the mutable partial component assembly with an explicit complete object checked by satisfies. Split the broad canvas workbench entrypoint into production application, production composition, and test-only entrypoints while preserving deep-module boundaries.

14. Restore behavioral retained-state policy by installing and reloading with caller-supplied retained state, asserting the exact allowlist and rejecting generation-bound values. Add multi-pane, honestly-unbound, session-boundary, queue lifecycle, remote-media, WebSocket, reload, and stale-CAS owners.

15. Run capped sequential focused, type, lint, formatting, policy, live WebSocket, and safe reload verification. Correct the protected artifact evidence through Backlog CLI, keep status and AC unchanged, commit on top of b9ef7228, and callback the parent with the fixed-base range.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the production Codex workbench composition root. It owns one retained process, replaces generation closures across reload, creates the reviewed runtime graph and five dynamic adapters once, installs all three dynamic namespace registrations, routes the closed eleven-method server-request union exhaustively, gates readiness on complete registration and session initialization, and performs ordered best-effort shutdown through browser/realtime/queue settlement, transport close, child TERM/KILL ownership, and final listener removal.

Added focused module owners for routing, reload retention, duplicate-owner refusal, failed-start cleanup, construction/startup order, and shutdown order. Added a repository-policy owner for constructor/adapter call-site cardinality, router exhaustiveness, and kept-state restrictions.

Validation: focused module owners 6 pass / 0 fail; composition policy 3 pass / 0 fail; test inventory 39 pass / 0 fail; codex realtime process contract 4 pass / 0 fail; resource cleanup process contract 8 pass / 0 fail; both TypeScript projects pass; scoped Oxlint and oxfmt pass; direct module-scope analysis of codex-workbench.ts reports zero findings or waivers. The canonical module-scope-policy and boundaries owners were also attempted separately inside the required 6 GiB memory / 1 GiB swap scopes; each was OOM-killed at the cgroup ceiling, so no pass is claimed for those full owners. Protected artifact SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

Independent fixed-base review of 8de971a0 found seven valid issues: the graph was not registered by the production application, session and approval owners self-registered alongside the exhaustive router, reload closed the retained transport, child exit did not retire all live owners or ready state, startup cleanup began after construction, the broad canvas index eagerly imported the full Codex graph, and same-owner duplicate installation was accepted. Remediation started; AC remains unchecked.

Remediation scope decision: TASK-143.01.14 owns the full production host bindings and all five dynamic adapters, then installs the graph in the real canvas lifecycle. TASK-143.01.15 verifies that completed graph; TASK-143.03.01 consumes the server gateway and does not instantiate owners. No fake, nullable, no-op, or deferred production bindings are acceptable.

Architecture decision: preserve createCodexThreadContextDelivery as the immutable fixed-target leaf and add an unbound process-lifetime controller in src/runtime/codex-thread-context. The controller owns the sole feed subscription and lifetime at-most-once ledger, consumes exact workhorse/thread-link authority through CAS, starts unbound, and never fabricates or selects a target. This approved scope expansion belongs to TASK-143.01.14; completed TASK-143.06.02 remains unchanged.

Remediation checkpoint: fixed listener ownership, retained graph reload, synchronous child retirement, construction/start failure cleanup, strict duplicate-owner refusal, and narrow canvas export. Added the approved process-lifetime thread-context controller with one subscription, a lifetime event ledger, exact CAS bind/rebind/clear, replaceable hooks, and child-exit revocation. Focused validation is green (46 tests / 272 assertions), both TypeScript projects pass, scoped Oxlint and oxfmt pass, and the protected artifact hash is unchanged.

Remaining blocker: the real canvas application still does not construct the full production host bindings/five dynamic adapters or await installation before HTTP readiness. That seam requires the concrete browser action/projection, semantic publisher/context capture, dynamic visual-approval, exact caller/target authority, and wait/lifecycle owners; landing only a lifecycle shell would violate the explicit no-placeholder/no-lazy-install direction. Reviewer finding 1 therefore remains open and TASK-143.01.14 is not ready for final review or AC completion.

Production application remediation complete and ready for fixed-base review. The real canvas application now creates the concrete semantic, visual-approval, caller/target/context/operation/lifecycle, browser projection/action, process, realtime, queue, and thread-context bindings; dynamically installs the narrow workbench entrypoint before HTTP listen; replaces only generation source hooks on reload; and awaits ordered terminal cleanup on startup failure, child exit, browser disconnect, signals, and server bind failure. All seven review findings are addressed.

Direct verification: a fresh empty-vault server remained running after the graph reached readiness, /health returned healthy, and SIGINT shut the process down cleanly. Final focused composition/application/adapter/protocol owners passed; both TypeScript projects passed; scoped Oxlint and oxfmt passed. The broader relevant runtime lane passed 192 owners except for one entrypoint-policy failure caused by an over-broad export, which was reverted and its isolated owner then passed. The full repository owner was OOM-killed at the required 6 GiB memory / 1 GiB swap ceiling after boundary checks; its isolated inventory owner passed. The previously recorded fresh hot-reload owner remains 4/4 and was not rerun.

Protected artifact is unchanged from fixed base 7f37c1a903492bbd7d02699df069f2d2bc3dccba and current HEAD (git object f56a8a8364ee677027f1e5eb31fb0644a18d338b); its actual SHA-256 is 3ffcfa2c2a07af83f4074c7e785a87aa1bb1df7a81bdbce58385525d2159cccb. The earlier 22f897... note was stale evidence, not a file change. AC remains unchecked for parent review.

Fixed-base remediation after b9ef7228 addresses all ten rejection findings. The retained canvas WebSocket server now owns the public Codex request bridge (connect, snapshot, lease claim/renew/release, account read, command, subscribe, close), derives browser and pane identity from server-owned registration, and was exercised over a real loopback WebSocket. Text start and steer use the canonical codex-instructions constructors with host-issued clientUserMessageId values, turnTrigger archboard, exact lease-bound context, and an authoritative in-progress turn read. Create, attach, and relink replace the semantic controller with the exact returned thread-link CAS proof; stale disconnects cannot clear a newer binding. Production no longer selects paneIds()[0] or fabricates a headless pane.

Queue shutdown closes admission and drains accepted work before composition cancels dynamic approvals and waits and continues authority teardown. The realtime server adapter is explicitly the protocol half rather than a false DOM host; realtimeStart returns the typed SDP answer through the browser command result for browser-local peer/media attachment, while negotiation failure is an explicit not_delivered command refusal. Component assembly is a complete object checked with satisfies. The catch-all canvas workbench barrel was removed in favor of narrow application, generation, owner, production, adapter, and browser entrypoints. A behavioral repository-policy owner installs and reloads through a sealed caller-supplied retained object and enforces the exact retained-key allowlist.

Validation: focused remediation owners 151 pass / 0 fail / 791 assertions; public socket owners including a real loopback WebSocket 3 pass / 0 fail; realtime process contract 4 pass / 0 fail / 65 assertions; both TypeScript projects pass; full Oxlint passes; full oxfmt check passes. The broad module lane passed the affected owners and continued near the end before its outer runner received SIGTERM, so no complete-lane pass is claimed. The repository aggregate again received the known polite-termination/OOM-family behavior after boundary owners; its relevant composition policy is included in the green focused lane and no aggregate pass is claimed.

Protected artifact evidence correction: the authoritative protected file is /home/msc/Projects/archboard/src-DlBR1tzg.js and its SHA-256 is 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. The prior 3ffcfa2c2a07af83f4074c7e785a87aa1bb1df7a81bdbce58385525d2159cccb statement referred to the wrong tracked design document and is superseded. TASK-143.01.14 remains In Progress and all acceptance criteria remain unchecked for parent review.
<!-- SECTION:NOTES:END -->
