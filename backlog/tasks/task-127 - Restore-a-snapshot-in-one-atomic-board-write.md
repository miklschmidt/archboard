---
id: TASK-127
title: Restore a snapshot in one atomic board write
status: Done
assignee:
  - '@codex'
created_date: '2026-08-26 07:06'
updated_date: '2026-08-27 17:48'
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
- [x] #1 A successful restore issues no clear or file request and exactly one marked POST /api/elements/batch. It enters one BoardContent mutation. Normal saving persists once and advances version once; held saving updates held content once, writes no note, and leaves persisted version unadvanced.
- [x] #2 Snapshot lookup, explicit target identity including name@variant, source-board comparison, and --force refusal text/order remain exact. Without --force, cross-board restore performs zero writes; with --force it overwrites only the named target in one write. --force does not bypass lock, claim, expected-version, doing, or note-conflict checks.
- [x] #3 Snapshot storage and public schemas remain element-only and unchanged. Restore supplies an empty file list; final server, note, held, and pane file membership is empty even when restored image elements retain fileId. This intentionally removes held-only target-file retention and preserves the existing normal-saving outcome.
- [x] #4 Public command/help/result/stdout/stderr/exits and deep-copy/repeat-restore isolation remain exact. A successful replacement clears target selection and produces one net element report plus an exact empty file replacement, never a cleared intermediate state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze exact snapshot help and package outcomes, fixed-base compatibility records, the 61-path registry, force/refusal strings, and the source-backed element-only file semantics.

2. In src/cli/commands/snapshot.ts replace only clearCanvas plus batchCreateElementsStrict with replaceSceneOnCanvas(snapshot.elements, []). Preserve server prerequisite, snapshot read, explicit target-board read, identity/force check ordering, and result construction. Do not modify the shipped server/runtime replacement owner.

3. Update snapshot restore's staged description and relationships to two GETs plus one POST /api/elements/batch, and update the canonical authored CLI audit from two writes to one replacement. Preserve help bytes, immutable fixed-base-compatibility.json, 61 path count, and ignored generated views.

4. Extend existing one-write, boards, CLI/contract, reporting, and Obsidian owners. Prove normal one request/persistence/version; held one update/zero disk/unadvanced version and exact held presentation; same-board plus force/no-force identity behavior; repeat-restore deep-copy isolation; selection cleanup; one net elements_changed and files_replaced []; empty server/note/held file membership; and zero writes on refusals. Reuse existing doing/lock/version/note-conflict suites instead of duplicating their cross-product.

5. Run focused type/lint/boundary, contracts, CLI, one-write, boards, Obsidian, doing, lock, version, and reporting gates, then stable fix/check/separate-test validation and independent fixed-range review. Add no browser or concurrency suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint (2026-08-27):
- Replaced snapshot restore’s DELETE clear + strict batch pair with replaceSceneOnCanvas(snapshot.elements, []) after the unchanged server, snapshot, target-board, and cross-board force checks. Snapshot storage remains element-only and --force is not forwarded to note persistence.
- Updated only the snapshot restore CommandContract relationship/description metadata and canonical authored CLI audit; registry paths, fixed help/argv bytes, and immutable 57-path compatibility remain unchanged.
- Extended existing package and one-write owners. Real-server evidence covers a variant target, no-force zero-write refusal, one marked POST, canonical elements, empty files despite image fileId, one version advance, one net elements_changed plus files_replaced [], selection cleanup, repeat nested deep-copy isolation, and held restore with unchanged note bytes/mtime/version.
- Focused validation green: type-check, test:one-write (127 checks), test:cli (639 checks), test:contracts (61 proofs/61 audited paths/1011 checks plus workflow checks), test:boards, test:obsidian, test:reporting, and git diff --check.

Final implementation validation (2026-08-27):
- bun run fix passed twice with identical empty-diff SHA-256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.
- bun run check passed completely, including the four sequential headless browser suites. A separate complete bun run test also passed.
- On-demand contract generation produced byte-identical artifacts in two owned temporary directories; the three ignored derived views were removed afterward.
- git diff --check passed; TASK-127 remains In Progress with all four acceptance criteria unchecked; committed worktree is clean.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made snapshot restore one atomic board-content replacement by preserving its existing server/snapshot/target reads and cross-board force decision, then replacing clear-plus-batch with replaceSceneOnCanvas(snapshot.elements, []). Snapshot storage remains element-only; normal and held restores now consistently produce canonical restored elements and empty embedded-file membership, including image elements retaining fileId. Normal saving uses one request/persistence/version advance; held mode uses one held update with zero note writes and unadvanced persisted version. Cross-board refusal/force targeting, exact public bytes, selection cleanup, one net element/file replacement, and nested repeat-restore isolation remain intact. Verified by 127 one-write checks, 639 CLI checks, 61 proofs/61 paths/1011 contract checks plus 93 workflows, boards/Obsidian/reporting/types/boundaries/refusal owners, stable fix passes, complete check and separate full test with serial headless browser lanes, deterministic generated ownership, and clean independent Standards and Spec reviews over 65160403dc8d6d9540ce805a5e8eb26e902ed5ea..4c0611c2c9939e816db2cc417f0293be6a82ce56.
<!-- SECTION:FINAL_SUMMARY:END -->
