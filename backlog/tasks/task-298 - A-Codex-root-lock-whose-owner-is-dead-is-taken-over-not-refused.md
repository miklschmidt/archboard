---
id: TASK-298
title: 'A Codex root lock whose owner is dead is taken over, not refused'
status: To Do
assignee: []
created_date: '2026-09-22 18:26'
labels:
  - bug
dependencies: []
ordinal: 518000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner lock inside CODEX_HOME (.archboard-codex-process.lock, src/runtime/codex-process/lib/storage.ts acquireLock) is a create-exclusive file holding the owner's pid, and nothing checks whether that pid is alive. A server that dies without its cleanup (killed by signal 9, a crash, or on 2026-09-22 a server whose state directory was moved out from under it by the TASK-296 migration, so its release unlinked a path that no longer existed) leaves the lock behind and every later start is refused with 'Dedicated Codex roots are locked or colliding … Stop the other owner before retrying'. The machine already held two hand-renamed .lock.stale-* files from 2026-09-13 and 2026-09-19 before today's, so this recurs and is always resolved by hand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A start that finds the lock held by a pid that is not alive sets the stale file aside (renamed with a timestamp, never deleted) and takes the lock; a lock held by a live pid is still refused with the same message, naming the pid.
- [ ] #2 A focused test covers both: a dead owner's lock is taken over and preserved beside the new one, and a live owner's lock is refused.
- [ ] #3 The refusal message tells the user what to do when the owner is a live process.
<!-- AC:END -->
