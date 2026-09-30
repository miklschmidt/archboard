---
id: TASK-126
title: Make replace import one atomic board write
status: Done
assignee:
  - '@codex'
created_date: '2026-08-26 07:06'
updated_date: '2026-08-27 17:17'
labels:
  - enhancement
dependencies: []
references:
  - TASK-123.01
  - TASK-068
  - src/runtime/engine/scene-document.ts
  - scripts/check-one-write.mjs
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make import --replace submit the staged scene—elements and embedded files—as one replacement request. The existing board-write owner mutates request-local BoardContent, converts once on input, settles once, persists the note once when saving is active or updates held content without disk persistence when saving is stopped, and broadcasts one net result. Preserve merge import and every public CLI spelling, result, stream, exit, and held contract. This is not a transaction framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every successful replace import enters exactly one BoardContent mutation and never calls /api/elements/clear or /api/files. Under normal saving that mutation calls the note persistence boundary once and advances the persisted board version once; under existing held/stopped-saving semantics it performs one held-content update, zero note writes, and leaves the persisted version null or unadvanced with the existing held result and diagnostic.
- [x] #2 The final board is the canonical converted imported scene: prior elements and stale file payloads are absent, while IDs, indices, labels, bindings, and insertion order remain owned by applyElementInput and settlement.
- [x] #3 Callers and panes receive no cleared intermediate state: one net elements_changed result replaces old with new, with imported files delivered from the same mutation; persistence occurs before broadcast when normal saving is active.
- [x] #4 Import spellings, result JSON, streams, exits, held behavior, and merge behavior stay compatible. A refused replace performs zero writes and preserves the old note under doing, claim/lock, version, and optimistic note-conflict refusals.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze the current import help, argv, result bytes, held and merge behavior, and fixed-base compatibility evidence. Stage and parse the scene before the mutation as today.

2. Add one narrow replaceSceneOnCanvas(elements, files) client operation over the existing /api/elements/batch route. Use an internal literal scene-replacement marker and embedded file records; keep batchCreateElementsOnCanvas append-only and add no endpoint or general transaction API.

3. Deepen the existing elementMutation plan for this single replacement case. On isolated BoardContent, clear elements and files, run applyElementInput once in input order, ingest usable files with existing rules, settle once, emit one whole-scene net delta, and reuse the clear route's selection cleanup. Keep the pane-only fullReport refusal distinct and preserve the existing held-content branch.

4. Switch only scene-document's replace branch to the new operation; delete its clearCanvas and postFiles calls. Leave merge import unchanged.

5. Update the import CommandContract relationship and canonical authored CLI audit for one batch replacement request; remove the conditional clear relationship. Preserve fixed-base-compatibility.json and leave generated proof views ignored and absent. Correct only stale documentation/comments that still describe replace import as multiple writes.

6. Extend existing one-write evidence with a pre-existing board and image-bearing replacement scene containing label/binding input plus ID/index repair. In normal-saving mode assert one request, one persistence, one version increment, canonical final elements/files, removed old content/stale files, unchanged receipt, and one post-persistence net WebSocket delta with no empty/clear message. Add a focused held-board case asserting one held-content update, zero note writes, unadvanced persisted version, and unchanged held result/diagnostic. Cover an Obsidian wrapper and retain a merge-preserves-prior-content control. Reuse CLI/contracts/Obsidian/doing/lock/version/boards owners; add no browser or concurrency framework.

7. Run focused one-write, CLI, contract, Obsidian, type, doing, lock, version, and board gates, then normal stable fix/check/separate-test validation and independent fixed-range review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint (2026-08-27): replace import now stages the scene and sends one marked POST /api/elements/batch through replaceSceneOnCanvas. The existing elementMutation owner clears request-local elements/files, applies input once, ingests usable embedded files, and produces one persisted or held net result; merge and ordinary batch creation remain append-only. The batch route reuses whole-board selection cleanup. Focused evidence is green: type-check, lint, one-write 105 checks, CLI 635 checks, contracts 61 paths/1011 plus workflows 93, and Obsidian 197. The image-bearing Obsidian replacement proves one request, one version advance, stale element/file removal, canonical label/binding/id/index handling, post-persistence net delta, and unchanged receipt. The held replacement proves one held update, zero note byte/mtime changes, an unadvanced persisted version, and the existing held receipt/diagnostic. TASK-126 remains In Progress with every AC unchecked.

Validation checkpoint (2026-08-27): both byte-stability passes of `bun run fix` were clean. The complete `bun run check` and a separate complete `bun run test` passed, including all four browser suites sequentially/headlessly. During validation, the human-performance lane twice produced its documented timing-sensitive no-correction reconciliation failure after earlier suites were green; each isolated `bun run test:human-performance` diagnosis passed, and the required complete chain was rerun to green rather than waived. Contract generation into two owned temporary directories produced byte-identical `cli-command-audit.md`, `command-contract-proof.json`, and `command-contract-proof.md`; the three derived checkout views remain absent and ignored while canonical `docs/design/cli-command-audit.json` remains tracked. `git diff --check` is clean. TASK-126 remains In Progress with all AC unchecked for independent fixed-range review.

Review remediation checkpoint (2026-08-27): replacement file membership now follows the settled scene. One shared owner validates supplied file records and derives the IDs drawn by resulting elements; buildScene and /api/files use the same drawn-ID classification. A replacement keeps and broadcasts only usable supplied files that the settled elements reference. The pane receives one replacement-only file frame, clears its current file map, then invokes pinned Excalidraw addFiles, so a reused ID loads changed bytes instead of being skipped. Additive /api/files and merge import remain unchanged. The normal and held one-write fixtures each cover a drawn reused ID with changed data, an unreferenced supplied file, and stale prior membership. Normal server/note delivery and held content retain only the drawn new payload; the receipt still counts both supplied records. Focused validation passed: lint, type-check, boundaries, CLI 635, contracts 61 paths/1011 plus workflows 93, Obsidian 197, boards, reporting 115, and one-write 106. Two bun run fix passes were stable and git diff --check passed. Per the remediation request, the prior complete check/test/browser evidence remains contextual and was not rerun. TASK-126 stays In Progress with all AC unchecked.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-27 16:07
---
Parent orchestration started after TASK-123 finalized. Plan against the shipped CommandContract and one-write boundary; prefer one existing atomic replacement owner over new abstractions, retries, or compatibility layers.
---

author: @codex
created: 2026-08-27 16:17
---
Parent approved the xhigh plan amendment. Atomic replace must cover both elements and embedded file membership in the same request-local BoardContent mutation; an element-only replacement plus later file post is still two writes and can retain stale file bytes. Reuse the existing batch/write boundary, with no new transaction, endpoint, retry, browser instrumentation, or TASK-127 implementation.
---

author: @codex
created: 2026-08-27 16:17
---
Plan correction approved before source implementation: existing held-board semantics are part of compatibility. A held replace still performs one atomic BoardContent update but intentionally makes zero note writes and does not advance the persisted version; normal saving performs exactly one persistence/version advance.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made import --replace one atomic board-content act using the existing batch route and write owner. Replacement now stages elements and embedded files together, clears only isolated request-local content, applies conversion once, settles once, derives exact drawn file membership, and emits one old-to-new element delta plus a replacement-only file frame. Normal saving performs one note persistence and version advance; held boards perform one held-content update with zero disk writes and unchanged persisted version. Open panes drop stale/orphan files and receive changed bytes for reused drawn IDs; merge import and additive file uploads remain unchanged. Verified by 106 one-write checks, 115 reporting checks, 635 CLI checks, 197 Obsidian checks, 61 proofs/61 paths/1011 contract checks plus 93 workflows, types/lint/boundaries/boards/refusal owners, stable fix passes, complete check and separate full test with serial headless browser lanes, deterministic generated ownership, and clean independent Standards and Spec reviews over 6e827498484772f9faf71ad55f1cccd8317fad78..553dfc08b2de345b88d03eaf34cde3e027406884.
<!-- SECTION:FINAL_SUMMARY:END -->
