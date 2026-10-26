---
id: TASK-532.04
title: The board store prepares a write and commits exactly the prepared candidate
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
updated_date: '2026-10-26T05:55:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0016-one-writer-at-a-time-per-board.md
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0058-an-interface-is-the-few-operations-its-callers-need.md
parent_task_id: TASK-532
ordinal: 955000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The historical correction route re-runs the first half of the store's write pass outside the lease: it reads the board, checks the version, applies correctHistoricalTransition, runs acceptedBoard with its own policy read, and then fakes a transition (apply returns the candidate) so the write commits the exact candidate that the code evidence was read for. packages/skills laying.ts runs apply plus accept a third time. acceptedBoard and correctHistoricalTransition are public only so callers can do this assembly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The board package offers a prepare operation that applies, accepts and addresses a candidate under the store's own rules, and a commit that writes exactly that candidate under the lease or refuses when the version moved
- [x] #2 The correction route and laying.ts no longer apply transitions, call acceptedBoard or replace a transition's apply; acceptedBoard and correctHistoricalTransition are private
- [x] #3 Candidate identity and the concurrent-write refusal are tested through the board operations on a temporary vault; the route keeps its HTTP status codes and error codes unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/board write module: split applyUnderLease's first half (missing-version check, boardBefore, apply, relocation, acceptance) into one internal candidate pass parameterised by the board reader, so the lease pass and a lease-free preparation run the same rules.
2. New operation prepareSemanticBoardWrite({vault, board, expectedVersion, transition | correct}): reads as the lease would (readSemanticBoardAtAsLeased), refuses a change to an existing board that finds none with BOARD_MISSING, applies the transition (or the private historical correction) and accepts it under the vault policy and addressing rules. Returns {outcome: prepared, board, location, previousVersion, descendants, commit({writer, signal})} or a SemanticWriteRejection. commit is bound to the preparation: under the lease it re-reads, refuses BOARD_VERSION_CONFLICT when the version moved, re-runs policy admission on the exact prepared board at the prepared timestamp, and writes it.
3. New pure step acceptedTransition(before, transition, at, policy) for laying.ts, which has no vault.
4. store-write.ts exports prepareSemanticBoardWrite and acceptedTransition in place of acceptedBoard and correctHistoricalTransition (width unchanged or lower).
5. Correction route: prepare, read evidence, commit; map refusals to the route's existing statuses (422 missing/invalid with INVALID_BOARD for INVALID_CONTENT, 409 BOARD_VERSION_CONFLICT with the route's message and version).
6. laying.ts uses acceptedTransition.
7. Tests: board tests on a temporary vault (commit keeps the prepared ids, a moved version is refused, a policy refusal is refused, a concurrent write between prepare and commit is refused); move the race case from the server race test to the board test; server correction tests keep status, evidence refusal and shutdown cancellation.
8. Checks: type-check, lint, focused tests, repository-policy, fmt; commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: packages/board write/candidate.ts holds the store's candidate checks (version, apply, relocation, policy and address admission) as checkedCandidate, run by the lease pass in write.ts and by write/prepare.ts with a lease-free as-leased read. prepareSemanticBoardWrite({vault, board, expectedVersion, transition | correct}) returns {outcome: prepared, board, location, previousVersion, descendants, commit({writer, signal})} or a SemanticWriteRejection; commit writes the prepared board at the prepared timestamp through writeSemanticBoardAt, so version and policy are admitted again under the lease and nothing is re-applied. acceptedTransition (accepted.ts) applies and admits a transition in memory for laying.ts. store-write exports these two in place of acceptedBoard and correctHistoricalTransition; board width stays 188.
Decisions: prepare refuses a change to an existing board that finds none with BOARD_MISSING (the route answered 422 BOARD_MISSING; the store's version check alone would say BOARD_VERSION_CONFLICT). The route maps prepare refusals: BOARD_VERSION_CONFLICT 409 with its own message and version, INVALID_CONTENT as INVALID_BOARD 422, any other code 422. The server race test is removed: prepare.test.ts owns the concurrent write between prepare and commit. The evidence dependency override was not introduced; the route test keeps spyOn on the code-check namespace, so semantic-board-routes.ts is unchanged.
Evidence: packages/board/tests/runtime/operations/write/prepare.test.ts (4 tests; a mutation that re-applies the transition at commit fails the id tests); apps/server/tests/server/routes/semantic-boards/semantic-board-correction.test.ts adds missing-board and INVALID_BOARD cases. type-check 0, lint 0, focused tests 772 pass, repository-policy 153 pass.

Review (review/prepared-write, 276a19f3c, 1d11bb4b6): behaviour kept. Restored the HTTP commit-stage 409 race test that the deleted race test held (fails when the 409 mapping drops BOARD_VERSION_CONFLICT); added a pending-schema-migration case to prepare.test.ts (prepare writes nothing, commit writes exactly the prepared board); corrected two candidate.ts comments. A correction preview no longer saves a pending migration to disk, which is an improvement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/board offers prepareSemanticBoardWrite (apply, accept and address under the store's rules, no lease) with a commit that writes exactly the prepared candidate under the lease and refuses when the version or policy moved, plus acceptedTransition for in-memory callers. The correction route and laying.ts no longer assemble the write; acceptedBoard and correctHistoricalTransition are private; board width stays 188. Every correction status and code is unchanged, and a preview no longer saves a pending schema migration. Verified by prepare.test.ts (ids kept, version and policy refusals, pending migration), the restored HTTP race test and the board, server and skills suites.
<!-- SECTION:FINAL_SUMMARY:END -->
