---
id: TASK-143.08.04
title: Make mandatory Codex startup actionable and leak-free
status: To Do
assignee: []
created_date: '2026-09-02 01:36'
updated_date: '2026-09-02 01:44'
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
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:44
---
User decision, 2026-09-02: @openai/codex is a runtime dependency. One Archboard server may have only one live or starting codex app-server instance. Crash recovery is allowed only as a serialized replacement after the previous exact child and process group are completely gone.
---
<!-- COMMENTS:END -->
