---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-143.01.10
  - TASK-143.02.03
  - TASK-143.05.04
  - TASK-143.06.02
  - TASK-143.07.04
  - TASK-143.07.06
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/canvas/lib/codex-workbench.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one production composition root in the canvas server. It instantiates every accepted runtime port once, supplies replaceable closures to kept state, and registers the closed browser surface; it contains no protocol reducer. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The composition instantiates process, epoch/session, realtime adapter, approval broker, general/coordinator tool dispatchers, semantic publisher/delivery, coordinator, queue, callbacks, spoken gate, and browser gateway exactly once and registers the completed graph with Canvas.
- [ ] #2 kept() stores only version-neutral serializable state, stable process handles, and replaceable closures; no generation-bound class instance, decoder, route handler, callback, or UI adapter survives a reload.
- [ ] #3 Startup and shutdown ordering is explicit: install decoders and reverse handlers before readiness, stop browser commands/realtime/queue first, settle reverse requests, close JSON-RPC, TERM then KILL the child within shared timing bounds, and remove listeners last.
- [ ] #4 Composition inspection exposes one public lifecycle probe for the dedicated process owner test and refuses duplicate child/listener/coordinator/queue/broker/gate registration.
<!-- AC:END -->
