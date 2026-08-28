---
id: TASK-130.09
title: 'Convert bind, lock, and one-write proofs to native process tests'
status: To Do
assignee: []
created_date: '2026-08-28 01:05'
updated_date: '2026-08-28 01:05'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
references:
  - scripts/check-local-bind.mjs
  - scripts/check-lock.mjs
  - scripts/check-one-write.mjs
  - TASK-086
  - docs/adr/0016-one-writer-at-a-time-per-board.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-local-bind, check-lock, and check-one-write prove behavior that an in-process test cannot answer. Convert their orchestration and assertions to typed Bun tests while retaining real competing processes, real loopback sockets, and write counting on the wire.

TASK-086 owns generic canvas startup and cleanup. This task owns only the bind, lease-exclusion, claim and hold, and one-write product proofs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-local-bind, check-lock, and check-one-write are replaced by typed native system tests with no in-process substitute for their competing-process or wire observations.
- [ ] #2 Bind tests distinguish the owned child from a foreign or stale responder and preserve the public refusal and recovery behavior on loopback ports.
- [ ] #3 Lock tests run at least two real processes against one vault and preserve lease acquisition, denial, expiry or recovery, claim interaction, content revocation, and camera non-revocation behavior asserted today.
- [ ] #4 One-write tests count real note-changing requests through the proxy and prove each requested align, patch, promote, import, or batch action reaches the note as exactly one write under one lock acquisition.
- [ ] #5 Owned canvas processes use TASK-086 lifecycle behavior; proxy and competitor processes add equivalent typed ownership, bounded shutdown, stderr retention, exit waiting, and cleanup proof.
- [ ] #6 Assertion failure and interrupted-process fixtures leave no owned child, listener, proxy, lease, port, or vault and identify process death separately from a product assertion.
- [ ] #7 Every test source file is at most 500 lines and representative foreign-bind, double-writer, stale-lease, and accidental multi-write mutations fail before the legacy scripts are deleted.
<!-- AC:END -->
