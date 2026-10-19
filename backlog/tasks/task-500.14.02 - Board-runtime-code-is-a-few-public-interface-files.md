---
id: TASK-500.14.02
title: Board runtime code is a few public interface files
status: To Do
assignee: []
created_date: '2026-10-19 09:18'
labels: []
dependencies:
  - TASK-500.14.01
parent_task_id: TASK-500.14
ordinal: 881000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
board exposes 20 runtime subpaths. The Codex review groups them: address (address, location), store-read (read, listing, catalogue, bound-vaults, decode), vault-policy (configuration, diagnostics), store-move (move, move-preview, which share cross-vault rules), and doing and lock stay as they are. The write capability (write, transitions, accepted, discard, rename, propagate) is the next task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/board runtime exports are address, store-read, vault-policy, store-move, doing, lock and the write interface of the next task, and every other name is private
- [ ] #2 The persistence invariants hold: every write through atomic-write, lease lock deny by default, and the persistence tests pass unchanged in assertions
- [ ] #3 bun run check passes
<!-- AC:END -->
