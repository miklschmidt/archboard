---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-31 23:44'
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
  - src/server/canvas/lib/codex-workbench.ts
  - src/server/canvas/index.ts
  - src/server/canvas/tests/codex-workbench.test.ts
  - src/server/canvas/tests/codex-workbench-generation.test.ts
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
1. Define the production composition contract in src/server/canvas/lib/codex-workbench.ts with a retained, version-neutral owner slot and replaceable generation closures; keep process handles and serializable authority evidence only.
2. Build one child-generation graph from the existing public module entrypoints: transport/session, identity and OperationId authority, epoch/thread-link/workhorse/realtime/approvals, the five dynamic-tool adapters, both dynamic dispatchers, semantic delivery, coordinator, queue, callbacks, spoken gate, and browser gateway.
3. Install the generated dynamic registrations and one exhaustive eleven-variant reverse-request router before publishing readiness. Route the seven ordinary approval methods, general and coordinator item/tool/call requests, and the three session requests to their exact owners with no generic fallback.
4. Add the canvas lifecycle seam so startup prepares the owner before server readiness, reload replaces only generation closures without duplicating owners, browser and child disconnect retire authority, and shutdown disposes browser/realtime/queue-facing owners, cancels approvals and waits, settles reverse requests, closes transport, stops the child, and removes listeners.
5. Add focused module and repository-policy tests that exercise the public production composition contract, exact construction/registration counts, router exhaustiveness and dynamic isolation, reload retention rules, startup ordering, duplicate-owner refusal, and shutdown/disconnect ordering.
6. Run the scoped composition/router/reload/startup/shutdown owners, relevant process-contract and repository-policy inventory owners, both TypeScript graphs, scoped Oxlint, formatting, diff/status checks, and the protected-file hash check in sequential capped systemd user scopes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the production Codex workbench composition root. It owns one retained process, replaces generation closures across reload, creates the reviewed runtime graph and five dynamic adapters once, installs all three dynamic namespace registrations, routes the closed eleven-method server-request union exhaustively, gates readiness on complete registration and session initialization, and performs ordered best-effort shutdown through browser/realtime/queue settlement, transport close, child TERM/KILL ownership, and final listener removal.

Added focused module owners for routing, reload retention, duplicate-owner refusal, failed-start cleanup, construction/startup order, and shutdown order. Added a repository-policy owner for constructor/adapter call-site cardinality, router exhaustiveness, and kept-state restrictions.

Validation: focused module owners 6 pass / 0 fail; composition policy 3 pass / 0 fail; test inventory 39 pass / 0 fail; codex realtime process contract 4 pass / 0 fail; resource cleanup process contract 8 pass / 0 fail; both TypeScript projects pass; scoped Oxlint and oxfmt pass; direct module-scope analysis of codex-workbench.ts reports zero findings or waivers. The canonical module-scope-policy and boundaries owners were also attempted separately inside the required 6 GiB memory / 1 GiB swap scopes; each was OOM-killed at the cgroup ceiling, so no pass is claimed for those full owners. Protected artifact SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.
<!-- SECTION:NOTES:END -->
