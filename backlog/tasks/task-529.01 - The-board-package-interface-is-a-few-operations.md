---
id: TASK-529.01
title: The board package interface is a few operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T01:39:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the board package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [ ] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deepened the runtime lock and rename seams (commit 86a49dabc). New operations: takeBackBoard (lock state + revoking hold + release, was assembled in the server take-back route), renameSemanticBoard (rename write + carrying this server's claim and the doing lines to the new name, was assembled in the server rename route), forgetBoardMemory (one forget of lock, claim and doing memory and the lock listeners, was five calls in server-resources). takeClaimRevocation now returns the lost claim with its 'ended' reason, so claimEndReason is private. Removed from the public interface: claimEndReason, claimOn, sleep (workbench registry now uses Bun.sleep), forgetLockAnnouncements, renameTransition. Board exported names 231 -> 229 (./lock 16 -> 14). holdBoard and releaseHold stay public only for tests/system/process-contracts/fixtures/process-resource-owner.ts. Left: the shared half (165 names, mostly data shapes) is unchanged; a read-board-and-open-the-addressed-variant operation would replace readSemanticBoard + statedVariant + addressedVariant in workbench, code-opener and apps/server, but those files belong to concurrent agents. Checks: type-check 0, lint 0, bun test --isolate packages/board apps/server tests/system/repository-policy board-lock-api vault-naming packages/workbench/tests/server/services 714 pass, renaming + cross-process-lock system tests 3 pass.
<!-- SECTION:NOTES:END -->
