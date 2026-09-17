---
id: TASK-253.05
title: >-
  Warn when a write removes a relationship an equivalent restated one already
  replaces
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 445000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 candidate r3 of the 2026-09-17 batch restated five relationships without ids in one edit, then removed the originals by id in a second edit, breaking relationship identity (ids-stable guardrail). The RELATIONSHIP_REPLACED warning (TASK-235.07) only sees removal and re-add in one batch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A write that removes a relationship by id while the board keeps another with the same from, to and kind answers with a warning naming both ids
- [x] #2 The single-batch warning still behaves as before, and a store test owns the two-write case
- [x] #3 A write that adds a relationship restating a kept one (same from, to, kind and label, at most one other property apart) answers with a RELATIONSHIP_DUPLICATED warning naming both ids
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. replaced-relationships.ts: keep the same-batch rule; add RELATIONSHIP_DUPLICATED for an added edge restating a kept one (same ends, kind, label, at most one other property apart) and RELATIONSHIP_REPLACED for removing an edge whose restatement already stands. 2. Tests in edge-identity.test.ts for the two-write sequence and for parallel calls with different labels. 3. authoring.md describes both codes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rule decidable from before/removed/after only (the store keeps no per-edge history). Removal case: a removed edge whose restatement (same ends, kind, label; at most one other property apart) was already on the board -> RELATIONSHIP_REPLACED. Added the write-time RELATIONSHIP_DUPLICATED warning too, since it fires on the first of the two writes, before identity is lost. Label must match so two calls with different messages between the same parts stay silent. Tests in edge-identity.test.ts; authoring.md describes both codes.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Writes now warn when a restatement without an id lands beside its original (RELATIONSHIP_DUPLICATED) and when a later write removes the original (RELATIONSHIP_REPLACED); two calls with different labels stay silent. Verified by edge-identity.test.ts and bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:FINAL_SUMMARY:END -->
