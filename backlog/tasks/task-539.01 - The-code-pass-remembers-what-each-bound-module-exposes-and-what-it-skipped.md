---
id: TASK-539.01
title: The code pass remembers what each bound module exposes, and what it skipped
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T19:25:00Z'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-539
type: feature
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A code pass reads each bound module (`module-reading.ts`) and drops the reading when it returns. The server remembers only the findings of each board, and it drops what the pass skipped (`code-findings-memory.ts`). A pane can then show neither the names nor how complete the reading is. TASK-537.06 needs the same memory, so this change lands once for both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For each judged container, the remembered pass holds its module, root files, the exact count of exposed names and of names used outside, and each name with its file, its line, the files that pass it on, and its outside users with the part that holds each user
- [x] #2 The number of exposed names minus the names used outside equals the number of names that EXPOSED_UNUSED lists for the same container
- [x] #3 Long lists are capped with exact counts beside them
- [x] #4 Each remembered board reading carries the skips of that board and the skips that name no board
- [x] #5 A route answers one container from memory only and never starts a pass
- [x] #6 Without an opt-in, the answer of archboard check --code is unchanged
- [x] #7 A reading quotes symbols, paths and lines only, never other text of a file (ADR 0046)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected boards: Archboard server routes and Archboard server. Proposals: Archboard server routes@TASK-539.01 and Archboard server@TASK-539.01. Code check and Code findings memory change on both; Code check route changes on the routes board.
2. code-intel: exposed-names.ts holds the one rule (tallyNames: top-level names, deduplicated by name, with the uses that reach them). EXPOSED_UNUSED and the new exposure reading both use it. exposureOf builds the reading: module, root files, exact counts, names sorted by users then name, users with the parts that own the first line (ownersAtLine, the rule of the findings). Caps 200 names and 25 users in the schema (EXPOSED_NAME_LIMIT, EXPOSED_USER_LIMIT).
3. The pass outcome gains exposures; the check answer schema does not, so archboard check --code is unchanged. candidate.ts strips them.
4. Server: memory keeps exposures per board and variant, the skips of the board and the skips naming no board, and a small container index (container, module, exposed, usedOutside) in the polled reading. New route GET /api/vault/code-findings/exposure?board=&variant=&container= answers one container from memory (requireVault, vaultOfRequest, 404 when not remembered, 400 when incomplete).
5. Docs: ADR 0046 amendment, CONTEXT.md Exposed name, boundaries.md export count.
6. Tests: code-intel interfaces.test.ts (barrel via, owned and unowned user, wide module over both caps); code-findings-route.test.ts (memory, no pass, other vault, answer without exposure); vault-naming system test lists the new route.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 31498e388 and 40ffe6b5b. Plan was written after the code (late); the proposals were drawn after the build and compared against the code check: no finding introduced or cleared (diff of archboard check --code with and without --variant TASK-539.01 is empty). Footprint against base e11885fa9: namedAndChanged Code check route, Code findings memory, Code check (routes board); Code check, Code findings memory (server board); changedNotNamed and namedNotChanged empty.
Decisions: (1) A separate 'Exposure route' part bound to answerExposure was drawn first and dropped: it needed two more relationships (RELATIONSHIP_UNDRAWN for Vault requirement and for the mount) for a function in the same file. The Code check route responsibility names the new answer instead. (2) The Code check description was at 1997 of 2000 characters; the stale sentence about src/shared/code-check/index.ts made room for the new one. (3) One entry for each name, deduplicated by name, members not listed: the same rule as EXPOSED_UNUSED, so exposed minus used outside equals its list. (4) Users are files at their first use line; the parts that hold them are the owners of that line. (5) Pass-wide skips (no board) are copied to every remembered reading of the pass. (6) tests/system/server-state/vault-naming.test.ts lists the new route (outside the named scope, one line). (7) New schema fields have defaults so existing fixtures stay valid; web fixtures needed no change.

Adopted on Archboard server routes and Archboard server. Behind: Archboard (packages/code-intel in 31498e388 and 40ffe6b5b) stays true: no import between packages was added.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The code pass remembers, for each judged container, its module, root files, exact counts of exposed and used names, and each name with file, line, via files and outside users with the parts that hold them, capped with exact counts. Exposed minus used equals what EXPOSED_UNUSED lists. Readings carry their skips, an exposure route answers one container from memory and never starts a pass, and without the opt-in the check answer is unchanged. Verified by interfaces.test.ts, code-findings-route.test.ts, check-code.test.ts and the full gate. Adopted on Archboard server and Archboard server routes.
<!-- SECTION:FINAL_SUMMARY:END -->
