---
id: TASK-127
title: Restore a snapshot in one atomic board write
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-26 07:06'
updated_date: '2026-08-27 17:25'
labels:
  - enhancement
dependencies: []
references:
  - TASK-123.01
  - TASK-048
  - TASK-003
  - TASK-059
  - src/cli/commands/snapshot.ts
  - src/runtime/engine/scene-document.ts
  - scripts/check-one-write.mjs
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace snapshot restore's clear-then-batch sequence with the existing atomic scene-replacement write after the same snapshot and target reads and cross-board force check. Snapshot storage remains element-only. Restoration therefore replaces the target with the saved elements and an empty embedded-file set in both normal and held modes. Preserve all public CLI bytes and ordinary write-boundary protections; add no snapshot migration or second replacement framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A successful restore issues no clear or file request and exactly one marked POST /api/elements/batch. It enters one BoardContent mutation. Normal saving persists once and advances version once; held saving updates held content once, writes no note, and leaves persisted version unadvanced.
- [ ] #2 Snapshot lookup, explicit target identity including name@variant, source-board comparison, and --force refusal text/order remain exact. Without --force, cross-board restore performs zero writes; with --force it overwrites only the named target in one write. --force does not bypass lock, claim, expected-version, doing, or note-conflict checks.
- [ ] #3 Snapshot storage and public schemas remain element-only and unchanged. Restore supplies an empty file list; final server, note, held, and pane file membership is empty even when restored image elements retain fileId. This intentionally removes held-only target-file retention and preserves the existing normal-saving outcome.
- [ ] #4 Public command/help/result/stdout/stderr/exits and deep-copy/repeat-restore isolation remain exact. A successful replacement clears target selection and produces one net element report plus an exact empty file replacement, never a cleared intermediate state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze exact snapshot help and package outcomes, fixed-base compatibility records, the 61-path registry, force/refusal strings, and the source-backed element-only file semantics.

2. In src/cli/commands/snapshot.ts replace only clearCanvas plus batchCreateElementsStrict with replaceSceneOnCanvas(snapshot.elements, []). Preserve server prerequisite, snapshot read, explicit target-board read, identity/force check ordering, and result construction. Do not modify the shipped server/runtime replacement owner.

3. Update snapshot restore's staged description and relationships to two GETs plus one POST /api/elements/batch, and update the canonical authored CLI audit from two writes to one replacement. Preserve help bytes, immutable fixed-base-compatibility.json, 61 path count, and ignored generated views.

4. Extend existing one-write, boards, CLI/contract, reporting, and Obsidian owners. Prove normal one request/persistence/version; held one update/zero disk/unadvanced version and exact held presentation; same-board plus force/no-force identity behavior; repeat-restore deep-copy isolation; selection cleanup; one net elements_changed and files_replaced []; empty server/note/held file membership; and zero writes on refusals. Reuse existing doing/lock/version/note-conflict suites instead of duplicating their cross-product.

5. Run focused type/lint/boundary, contracts, CLI, one-write, boards, Obsidian, doing, lock, version, and reporting gates, then stable fix/check/separate-test validation and independent fixed-range review. Add no browser or concurrency suite.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-27 17:17
---
Parent orchestration started after TASK-126 shipped. Reuse the reviewed atomic scene-replacement owner for snapshot elements; preserve existing target-board, force, deep-copy, held, and refusal behavior without a second replacement framework.
---

author: @codex
created: 2026-08-27 17:25
---
Parent approved the xhigh plan amendment: snapshot storage remains element-only, and atomic restore passes an empty file list to the shipped replacement owner. This preserves current normal-saving behavior while removing accidental held-only retention of target files. No snapshot file schema, migration, pre-read, special held branch, or second replacement framework is authorized.
---
<!-- COMMENTS:END -->
