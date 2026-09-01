---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-09-01 00:35'
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
  - src/runtime/codex-approvals/lib/broker.ts
  - src/runtime/codex-approvals/lib/contract.ts
  - src/runtime/codex-approvals/tests/listener-ownership.test.ts
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
  - src/server/canvas/index.ts
  - src/server/canvas/codex-workbench.ts
  - src/server/canvas/lib/codex-workbench.ts
  - src/server/canvas/tests/codex-workbench-generation.test.ts
  - src/server/canvas/tests/codex-workbench.test.ts
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
<!-- SECTION:NOTES:END -->
