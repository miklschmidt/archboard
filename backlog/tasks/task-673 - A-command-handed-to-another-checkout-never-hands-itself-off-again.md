---
id: TASK-673
title: A command handed to another checkout never hands itself off again
status: To Do
assignee: []
created_date: '2026-11-22T23:51:00Z'
labels:
  - bug
dependencies: []
ordinal: 1155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-23 a reviewer made a throwaway clone of this repository whose node_modules was a symlink to another checkout, and ran `archboard check semantics` in it. The hand-off of ADR 0049 (packages/workspace/src/runtime/services/source-checkout.ts, handOff and handOffTarget) asks which checkout it runs from through module resolution, which followed the symlink to the other checkout, and which checkout the working directory is in, which was the clone. They differed, so it ran the clone's bin/archboard, which asked the same and handed off again: about 700 chained processes, roughly 32 GB, and an out-of-memory kill of other work. A hand-off must never recurse, whatever the setup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A process that was started by a hand-off never hands off again, and if it would, it stops with an error that names both checkouts
- [ ] #2 A test reproduces the symlinked-node_modules setup and shows one hand-off at most
- [ ] #3 A normal hand-off from one archboard checkout into another still works
<!-- AC:END -->
