---
id: TASK-148.11
title: Isolate owned system canvases with XDG state
status: To Do
assignee: []
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:01'
labels: []
dependencies: []
references:
  - tests/system/support/owned-canvas.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/runtime/engine/state-dir.ts
  - tests/system/browser/run-browser-lane.ts
parent_task_id: TASK-148
ordinal: 283000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
startOwnedCanvas does not forward an isolated XDG_STATE_HOME, so concurrent worktrees and two canvases collide on the machine-global Codex workbench root and lock. Give each owned canvas a disposable home/config/state/temp namespace, following the proven browser-owner recipe.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every owned system canvas resolves Codex workbench state under its own disposable XDG_STATE_HOME rather than ~/.local/state.
- [ ] #2 Two focused owners can run concurrently without Dedicated Codex roots locked/colliding errors, and cleanup removes each namespace on success, failure, and interruption.
- [ ] #3 Production stateDir behavior remains unchanged; only test ownership injects isolation.
- [ ] #4 The system lane's forced max-concurrency=1 is not removed in this task without separate measured evidence.
<!-- AC:END -->
