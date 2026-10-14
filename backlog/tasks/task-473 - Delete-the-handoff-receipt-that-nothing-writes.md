---
id: TASK-473
title: Delete the handoff receipt that nothing writes
status: To Do
assignee: []
created_date: '2026-10-14 22:52'
labels: []
dependencies:
  - TASK-472.04
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
ordinal: 838000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The review of TASK-472.01 found that nothing in src calls recordLockCommit, the only function that sets committedHash on a lease. So writeHandoff never writes a handoff receipt, takeHandoff never finds one, and predecessorHash never reaches a lock holder: the whole handoff-receipt path is dead code that every reader of the lock state must still understand. The owner asked on 2026-10-15 to delete it in this implementation session. It waits for TASK-472.04, which rekeys the same lock state by vault and board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 recordLockCommit, writeHandoff, takeHandoff, committedHash, predecessorHash and the handoff receipt file are gone, and nothing reads or writes them
- [ ] #2 Lease, claim and release behaviour is unchanged, and the existing lock and claim tests pass
- [ ] #3 No document, ADR consequence or skill states the handoff receipt as current behaviour, as the sweep of the archboard-dev skill requires
- [ ] #4 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->
