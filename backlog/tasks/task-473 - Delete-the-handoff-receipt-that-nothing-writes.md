---
id: TASK-473
title: Delete the handoff receipt that nothing writes
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 22:52'
updated_date: '2026-10-15 00:29'
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
- [x] #1 recordLockCommit, writeHandoff, takeHandoff, committedHash, predecessorHash and the handoff receipt file are gone, and nothing reads or writes them
- [x] #2 Lease, claim and release behaviour is unchanged, and the existing lock and claim tests pass
- [x] #3 No document, ADR consequence or skill states the handoff receipt as current behaviour, as the sweep of the archboard-dev skill requires
- [x] #4 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board proposal: no board is affected. The only dogfood binding into the lock code is the path src/runtime/engine/board-lock.ts (Archboard server routes); no board part, relationship, anchor or description names recordLockCommit, writeHandoff, takeHandoff, committedHash, predecessorHash or the .handoff receipt (git grep over .archboard/vault, 'receipt' hits only the unrelated rasterizer receipt). The removal changes no drawn part or relationship. No proposal is branched.
2. Delete in src/runtime/engine: recordLockCommit, writeHandoff, takeHandoff, readHandoff, matchesPredecessor, handoffPathFor, textFields (only readHandoff used it), the recordLockCommit re-export in board-lock.ts, LockHandoff, LockRecord.committedHash, LockHold.predecessorHash and LockHold.leaseToken (leaseToken only existed to stamp a commit), the committedHash branch of releaseHold and holderOf, holdFrom's takeHandoff call (holdFrom collapses), and the unused test support board-lock-test-adapter.ts (withLockHandoffReadFault, imported by nothing).
3. Sweep (git grep -i of every spelling): docs, CONTEXT.md, skills, ADR 0016/0006/0022, code comments and test names. ADR bodies stay as written.
4. Gate one lane at a time: lint, type-check (exit status), fmt:check, test:modules, test:system, test:repository, test:opt-in:topology. Existing lock and claim tests (board-lock-lease, board-lock-announcements, board-lock-vaults) must pass unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in 84a025732. Deleted recordLockCommit, writeHandoff, takeHandoff, readHandoff, matchesPredecessor, handoffPathFor, textFields, LockHandoff, LockRecord.committedHash, LockHold.predecessorHash, LockHold.leaseToken (it only existed to stamp a commit), holdFrom, the unused test support board-lock-test-adapter.ts, and folded writeJsonRecord/readJsonRecord into their one caller each. No board is affected: no dogfood board names any of these symbols or the receipt (the vault 'receipt' hits are the rasterizer receipt); the only binding is the path board-lock.ts, unchanged. No document, skill or ADR states the receipt (git grep -i over docs, skills, root documents, CONTEXT.md, src/cli found none; ADRs 0016, 0006, 0022 do not mention it). One stale code comment left for its owner: src/runtime/semantic-board-store/lib/discard.ts:21 says 'Semantic writes leave no commit handoff beside the lease', which names the deleted receipt (outside this task's write fence, TASK-472.12 area). Gate: lint, type-check, fmt:check, test:modules (4558 pass), test:system (206 pass), test:repository (27 pass), test:opt-in:topology (1 pass) all green.

The stale discard.ts comment was fixed in aeb48c8c0 after TASK-472.12 committed. The complete gate (bun run check) passed in a clean worktree at 65c950de5, which holds 84a025732: modules, system, repository and the 19 serial browser files, exit 0. git grep over src, tests, docs, skills, root documents and .archboard finds none of recordLockCommit, writeHandoff, takeHandoff, committedHash, predecessorHash or the receipt.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Deleted the dead handoff-receipt path from the lock code: recordLockCommit, writeHandoff, takeHandoff and its helpers, committedHash, predecessorHash and the unused test adapter (84a025732), and the last comment that named it (aeb48c8c0). Lease, claim and release behave as before: the existing lock and claim tests pass unchanged and the complete gate passed at 65c950de5. No document or board named the receipt, so no proposal was branched.
<!-- SECTION:FINAL_SUMMARY:END -->
