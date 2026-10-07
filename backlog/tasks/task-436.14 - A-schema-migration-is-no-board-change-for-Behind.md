---
id: TASK-436.14
title: A schema migration is no board change for Behind
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:37'
updated_date: '2026-10-07 00:56'
labels:
  - history
dependencies: []
parent_task_id: TASK-436
ordinal: 708000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Behind finds the last change of a board by comparing its current variant before and after each commit to the board file. If this build cannot read an old version, for example one in an older schema, it counts that commit as a change. So the commit that migrated the file becomes the last change, and the board reads as less behind than it is. ADR 0045 says that a migration write is no change.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Behind decodes an old version of a board file with the migrations of the board store, and writes nothing
- [ ] #2 A commit that only migrated a board file is not its last change, with a test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected proposals are Archboard server@TASK-436.14 and Board persistence@TASK-436.14; the architecture agent committed them as 3201c025d in the integration checkout.
2. Extract the store’s pure JSON decode, legacy-field refusal, registered migrations and canonical validation into public decodeSemanticBoardDocument(text), owned by semantic-board-store/lib/decode.ts.
3. Keep persistence and board identity/vocabulary checks in the existing store read boundary; historical decoding must need no vault lookup, lease, clock or write.
4. Make Behind compare decoded historical boards through that store contract so schema-only migration commits and an uncommitted schema migration do not move the semantic last change.
5. Add focused migration/no-write and Behind migration-commit behavior tests, run the relevant history/store owners, simplify, record validation and commit a TASK-436.14 checkpoint. Leave terminal task acceptance to integration and its complete gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Extracted public decodeSemanticBoardDocument(text) from the store read path. It performs JSON decode, legacy-label refusal, all registered migrations and canonical coherence validation in memory, with no vault lookup, lease, file access, version advance or clock. Disk reads retain identity/vocabulary checks and lease-bound atomic persistence, including canonical validation after version advancement. Behind uses that public contract for Git blobs. Regression owners verify an old 2.2 document missing explicit order is decoded without changing bytes, mtime, vault entries, version or timestamps; both an in-memory upgrade and a committed schema-only upgrade retain the old semantic last-change commit and pre-migration code changes. ADR0045 documents this behavior and the TASK-436.13 project-directory scope. Validation: focused Behind/read-migration 14 tests passed; all history-lens and semantic-board-store owners 234 tests passed; root tsc --noEmit and touched production/test lint passed; touched formatting and git diff --check passed. Simplified by sharing decoding once, retaining raw migrated JSON for persistence, and keeping canonical validation at the persistence boundary. Board proposals remain integration-owned at 3201c025d; terminal acceptance and full gate remain for main integration.
<!-- SECTION:NOTES:END -->
