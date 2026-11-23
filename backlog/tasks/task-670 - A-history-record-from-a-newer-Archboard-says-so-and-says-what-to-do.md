---
id: TASK-670
title: A history record from a newer Archboard says so, and says what to do
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T16:20:00Z'
updated_date: '2026-11-23T01:55:00Z'
labels:
  - bug
dependencies: []
ordinal: 1163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a newer Archboard writes a record into the local archboard-history branch (for example the upgrade installation record with inventoryDigest), older code fails every model read with a raw schema dump and "Restore the local archive or explicitly fetch the named archboard-history branch from its owner, then retry the exact checkpoint" (packages/model/src/runtime/canonical/history/retained-reading/operations/result.ts:110). That advice is wrong: nothing is lost; the vault was upgraded by a newer Archboard. The history branch is shared by every checkout of a repository on a machine, so this reaches checkouts the upgrade never touched. Owner, 2026-11-22: "Fix the message. No history roll back."
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A history record that this Archboard cannot read because a newer one wrote it is refused with a message that says the vault was upgraded by a newer Archboard, names what it found, and says to update Archboard
- [x] #2 The raw schema dump is not shown to the reader
- [x] #3 A record that is malformed rather than newer keeps a message that says it is damaged and how to recover
- [x] #4 A test covers both cases
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Records already carry schemaVersion 1, but the upgrade installation (inventoryDigest) was added without raising it, and two readers (readRecord, archiveRecords in model-archive.ts) parse with a strict schema, so a ZodError dump reaches historyResult and its default fetch-the-branch advice.
2. Name the format: RECORD_FORMAT = 1 in model-archive.ts. Writers stamp it; the reader accepts 1..RECORD_FORMAT.
3. One decoder for both readers: read schemaVersion first; above RECORD_FORMAT throws ArchiveError ARCHIVE_NEWER (new failure code, recovery: update Archboard, history is intact); otherwise a parse failure throws ARCHIVE_UNREADABLE naming the record and its first problem, never the schema dump.
4. Rewrapping sites (assertTipWritable, model-publication) pass ArchiveError through.
5. Pin the record format: a test fingerprints the record schema with RECORD_FORMAT, so a shape change must raise the format.
6. Tests: a newer record and a damaged record in the archive, read through listArchitectureCheckpoints.
7. Skill reference names ARCHIVE_NEWER.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Records are decoded in one place, decodeRecord in packages/model/src/runtime/canonical/archive/store/model-archive-record.ts, used by readRecord and archiveRecords. The marker is the existing schemaVersion, now named RECORD_FORMAT (1); the reader accepts 1..RECORD_FORMAT. A format above it is ARCHIVE_NEWER (new failure code, HTTP 422 by default); any other schema failure is ARCHIVE_UNREADABLE with the record id and its first problem. assertTipWritable and the publication closure pass ARCHIVE_NEWER through instead of rewrapping it. record-format.test.ts pins the record schema's JSON Schema digest to RECORD_FORMAT. Older readers (before this commit) cannot be fixed and still show the dump; the history ref was not touched. The new file is not bound to a module in .archboard/vault yet. Checks: tsc (source and frontend) clean, TypeScript lint clean, format:check clean, 256 tests in packages/model/tests/runtime/{canonical,upgrade,legacy-boards,store} pass. vp run types/lint:all stop at the renderer core build (wasm-bindgen glue guard in scripts/build-core.ts), outside this task.

The upgrade record schema was subsequently bumped to format 2 in 841316d687. The reader accepts formats 1 and 2 and reports ARCHIVE_NEWER for a higher format.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A history record from a newer Archboard is now refused with ARCHIVE_NEWER: "This vault's history was written by a newer Archboard: record <id> has format <n>, and this Archboard reads formats up to 1.", recovery "Update Archboard to the newest release, then retry. The history is intact: do not restore, fetch or roll back the archboard-history branch." A damaged record stays ARCHIVE_UNREADABLE, now "History record <id> is damaged: <field>: <problem>." with the inspect-and-restore recovery. No schema dump reaches the reader. Records keep their schemaVersion marker, named RECORD_FORMAT; a test pins the record schema to it so a future change must raise it. Risk: Archboard builds older than this change still show the dump; only builds from here on give the true message.
<!-- SECTION:FINAL_SUMMARY:END -->
