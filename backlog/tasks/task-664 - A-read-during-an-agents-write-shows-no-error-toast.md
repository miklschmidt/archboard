---
id: TASK-664
title: A read during an agent's write shows no error toast
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T13:35:00Z'
updated_date: '2026-11-22T14:00:00Z'
labels:
  - bug
dependencies: []
ordinal: 1152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While an agent writes the model, the write holds the model lock, and a browser read in that window answers MODEL_BUSY (packages/model/src/runtime/canonical/installation/store/model-state.ts:340). The browser then shows a red "Architecture unavailable" toast for an ordinary, healthy write. Seen while diagnosing the corrections browser flake on 2026-11-22. A reader should see the model refresh when the write lands, not an error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A browser read that meets a write in progress shows no error toast
- [x] #2 The reader shows the written model once the write lands
- [x] #3 A model that stays unreadable still shows its error
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The browser shows the toast from either a failed read (query.error) or the feed's refusal (feed.failure), readingProblem in ArchitectureModelStage.tsx. Both carry MODEL_BUSY during a write: the server's model watch announces architecture_status MODEL_BUSY when its poll meets the lock (model-watch.ts readingEvent), and every model query has retry: false, so a read that meets the lock fails at once.
2. One busy-read policy beside ArchitectureReadError (queries.ts busyRetry): a read refused with MODEL_BUSY reads again every 250 ms for as long as an agent waits for a model (MODEL_LOCK_MS.waitCap, 5 s); any other refusal fails at once. Every query that throws ArchitectureReadError uses it (model, record, module, retained module, history, branch footprint).
3. The feed treats a busy status as no news: it keeps its last failure and summary and reads nothing, because the write's completion arrives as its own event.
4. Tests: feed-reads.test.ts proves a busy read and a busy status fail nothing and the written model arrives, and a lasting refusal fails at once; repository-catalog.test.tsx proves a busy status leaves the row as it was and a lasting refusal shows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner, 2026-11-22: fix it on its own stack layer (fix/busy-reads). Suggested direction: retry a busy read a default number of times before any error notice reaches the user.

Verified: feed-reads.test.ts and repository-catalog.test.tsx fail on the old source (the busy read and busy status reached query.error, feed.failure and the row) and pass on the new; test:modules 5334 pass, 0 fail; types, lint:all and format:check pass; canonical-model-corrections and canonical-model-migration browser tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A read that meets an agent's write no longer shows the red Architecture unavailable toast.

Cause: the toast comes from a failed read or the feed's refusal (readingProblem in ArchitectureModelStage.tsx). During a write both said MODEL_BUSY: the server's model watch announces architecture_status MODEL_BUSY when its poll meets the lock, and every model query failed on its first refusal (retry: false).

Change: one busy-read policy (busyRetry in model-reader/access/clients/queries.ts) that every model, module, retained-module, history and footprint query uses: a MODEL_BUSY refusal reads again every 250 ms (MODEL_CACHE_MS.busyRetry) for as long as an agent waits for a model (MODEL_LOCK_MS.waitCap); any other refusal fails at once. The feed (events.ts) treats a busy status as no news and keeps what the tab and the repository row hold until the write's completion event arrives.

Tests: feed-reads.test.ts covers a busy status and a busy read that end in the written model with no failure, and a lasting MODEL_INVALID that fails at once; repository-catalog.test.tsx covers a busy status that leaves the row alone and a RECOVERY_REQUIRED that shows.

Risk: a model held busy past 5 s still shows its MODEL_BUSY error on a read; while no read happens, a busy feed status alone shows nothing.
<!-- SECTION:FINAL_SUMMARY:END -->
