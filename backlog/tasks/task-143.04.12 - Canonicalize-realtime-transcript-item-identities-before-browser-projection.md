---
id: TASK-143.04.12
title: Canonicalize realtime transcript item identities before browser projection
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-04 16:09'
updated_date: '2026-09-04 16:17'
labels: []
dependencies: []
parent_task_id: TASK-143.04
priority: high
type: bug
ordinal: 287000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-143.04.07 now completes SDP and started, then a valid final transcript such as controlled-user-transcript reaches voice.transcript[].itemId as the raw Codex wire value. BrowserSnapshot requires an authority-issued canonical ItemId and rejects the whole workbench state as invalid_projection. This child owns the exact raw-item-to-canonical identity boundary so the controlled live-voice browser owner can publish transcripts without weakening identity checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every item-scoped realtime transcript notification resolves its raw Codex item identity to the authority-issued canonical ItemId before the adapter retains or publishes a transcript record.
- [ ] #2 Invalid, unissued, stale-authority, wrong-thread, and wrong-realtime-session item notifications do not mutate retained transcript state or publish a transcript event.
- [ ] #3 A focused adapter-to-production-projection owner fails on the raw-item invalid_projection path before the fix and passes with the canonical item while proving invalid and stale items never publish.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep one focused cross-module owner that sends a raw realtime transcript item through the adapter and production browser projection, reproducing the invalid_projection failure and proving rejected item paths never publish.
2. Canonicalize transcript item identities at the adapter input boundary with the existing authority ledger: adopt the item introduced by a fully correlated item/started notification, resolve later delta/completed references, and batch-adopt recovered timeline items before mutating transcript state. Retain and publish canonical identity values while preserving the browser-neutral realtime media contract.
3. Run the focused realtime, identity, and projection owners, both TypeScript projects, scoped Oxlint and Oxfmt checks, inspect the fixed-base diff, and commit the review-ready range without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Red proof: the focused adapter-to-production-projection test received refused/invalid_projection for raw controlled-user-transcript before the adapter boundary changed. Implementation uses the existing identity authority ledger: item/started introduces an ID only after child, epoch, thread, session, type, role, and text validation; delta and completed resolve only already-issued IDs; recovery batch-adopts matching transcript IDs before inserting them. Rejected stale epoch, wrong thread, wrong session, invalid, and unissued reference paths leave the retained transcript and publication count unchanged. Validation is recorded in the delegated callback and commit; the task remains In Progress for parent review and final browser verification.
<!-- SECTION:NOTES:END -->
