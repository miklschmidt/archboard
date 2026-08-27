---
id: TASK-126
title: Make replace import one atomic board write
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-26 07:06'
updated_date: '2026-08-27 16:33'
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
- [ ] #1 Every successful replace import enters exactly one BoardContent mutation and never calls /api/elements/clear or /api/files. Under normal saving that mutation calls the note persistence boundary once and advances the persisted board version once; under existing held/stopped-saving semantics it performs one held-content update, zero note writes, and leaves the persisted version null or unadvanced with the existing held result and diagnostic.
- [ ] #2 The final board is the canonical converted imported scene: prior elements and stale file payloads are absent, while IDs, indices, labels, bindings, and insertion order remain owned by applyElementInput and settlement.
- [ ] #3 Callers and panes receive no cleared intermediate state: one net elements_changed result replaces old with new, with imported files delivered from the same mutation; persistence occurs before broadcast when normal saving is active.
- [ ] #4 Import spellings, result JSON, streams, exits, held behavior, and merge behavior stay compatible. A refused replace performs zero writes and preserves the old note under doing, claim/lock, version, and optimistic note-conflict refusals.
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
