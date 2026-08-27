---
id: TASK-126
title: Make replace import one atomic board write
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-26 07:06'
updated_date: '2026-08-27 16:17'
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
Make import --replace submit the staged scene—elements and embedded files—as one replacement request. The existing board-write owner mutates request-local BoardContent, converts once on input, settles once, persists the note once, and broadcasts one net result. Preserve merge import and every public CLI spelling, result, stream, and exit contract. This is not a transaction framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every successful replace import, including a valid embedded-image scene and an Obsidian wrapper, makes one mutating HTTP request, calls the note persistence boundary once, advances the board version once, and never calls /api/elements/clear or /api/files.
- [ ] #2 The final board is the canonical converted imported scene: prior elements and stale file payloads are absent, while IDs, indices, labels, bindings, and insertion order remain owned by applyElementInput and settlement.
- [ ] #3 Callers and panes receive no cleared intermediate state: one post-persistence net elements_changed result replaces old with new, with imported files delivered from the same persisted mutation.
- [ ] #4 Import spellings, result JSON, streams, exits, and merge behavior stay compatible. A refused replace performs zero writes and preserves the old note under doing, claim/lock, version, and optimistic note-conflict refusals.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze the current import help, argv, result bytes, merge behavior, and fixed-base compatibility evidence. Stage and parse the scene before the write as today.

2. Add one narrow replaceSceneOnCanvas(elements, files) client operation over the existing /api/elements/batch route. Use an internal literal scene-replacement marker and embedded file records; keep batchCreateElementsOnCanvas append-only and add no endpoint or general transaction API.

3. Deepen the existing elementMutation plan for this single replacement case. On isolated BoardContent, clear elements and files, run applyElementInput once in input order, ingest usable files with existing rules, settle once, emit one whole-scene net delta, and reuse the clear route's selection cleanup. Keep the pane-only fullReport refusal distinct.

4. Switch only scene-document's replace branch to the new operation; delete its clearCanvas and postFiles calls. Leave merge import unchanged.

5. Update the import CommandContract relationship and canonical authored CLI audit for one batch replacement request; remove the conditional clear relationship. Preserve fixed-base-compatibility.json and leave generated proof views ignored and absent. Correct only stale documentation/comments that still describe replace import as multiple writes.

6. Extend existing one-write evidence with a pre-existing board and image-bearing replacement scene containing label/binding input plus ID/index repair. Assert one request, one persistence, one version increment, canonical final elements/files, removed old content/stale files, unchanged receipt, and one post-persistence net WebSocket delta with no empty/clear message. Cover an Obsidian wrapper and retain a merge-preserves-prior-content control. Reuse CLI/contracts/Obsidian/doing/lock/version/boards owners; add no browser or concurrency framework.

7. Run focused one-write, CLI, contract, Obsidian, type, doing, lock, version, and board gates, then normal stable fix/check/separate-test validation and independent fixed-range review.
<!-- SECTION:PLAN:END -->

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
<!-- COMMENTS:END -->
