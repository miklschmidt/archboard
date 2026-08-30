---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 17:03'
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
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one production composition root in the canvas server. It instantiates every accepted runtime port once, routes every server request exhaustively, supplies replaceable closures to kept state, and registers the closed browser surface; it contains no protocol reducer. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The composition instantiates process, epoch/session, workhorse transaction, realtime, approval broker, general/coordinator dispatchers, semantic delivery, coordinator, queue, callbacks, spoken gate, and browser gateway exactly once.
- [ ] #2 One exhaustive router handles all eleven generated server request variants: seven broker families, item/tool/call, currentTime/read, token refresh, and attestation; each reaches its sole owner or reviewed protocol error and no default branch responds generically.
- [ ] #3 kept() stores only version-neutral serializable state, stable process handles, and replaceable closures; no generation-bound class instance, decoder, route handler, callback, or UI adapter survives reload.
- [ ] #4 Startup/shutdown ordering installs decoders/router before readiness, then stops browser/realtime/queue, settles requests, closes JSON-RPC, TERM/KILLs the child, and removes listeners; duplicate owner registration refuses.
<!-- AC:END -->
