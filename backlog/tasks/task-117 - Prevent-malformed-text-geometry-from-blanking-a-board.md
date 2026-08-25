---
id: TASK-117
title: Prevent malformed text geometry from blanking a board
status: Done
assignee:
  - '@codex'
created_date: '2026-08-25 11:34'
updated_date: '2026-08-25 12:12'
labels: []
dependencies: []
references:
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - src/core/expand-elements.ts
  - frontend/src/canvas/useCanvasSession.ts
documentation:
  - docs/agents/test-suite.md
modified_files:
  - src/core/geometry.ts
  - src/core/board-write.ts
  - src/core/board-io.ts
  - src/server.ts
  - frontend/src/canvas/useCanvasSession.ts
  - scripts/check-geometry.mjs
  - scripts/check-boards.mjs
  - scripts/check-fixed-point.mjs
  - scripts/check-live-session.mjs
  - docs/agents/test-suite.md
priority: high
type: bug
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board can persist an auto-resizing Helvetica text element without finite width and height. Excalidraw then computes a non-finite camera state, the pane report serializes it as null, POST /api/panes returns 400, zoom displays %NaN%, and the board does not render. Reject malformed write input before it reaches a note, and make legacy malformed notes fail visibly without corrupting pane telemetry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An auto-resizing text element in an unmeasurable font with no finite width or height is refused atomically with an error that identifies the element and invalid fields
- [x] #2 No successful write can persist an element whose required render geometry is missing or non-finite
- [x] #3 Opening a legacy note with malformed geometry shows an actionable board error instead of a blank canvas or %NaN% zoom
- [x] #4 Pane reports never send non-finite viewport values as null, and a failed pane report can recover after the underlying scene is corrected
- [x] #5 The 400 response for invalid pane telemetry identifies the failing field path
- [x] #6 Regression coverage reproduces the Helvetica missing-dimensions case and proves finite zoom, a rendered board or explicit board error, and successful pane registration
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one pure render-geometry validator in `src/core/geometry.ts` that reports every live element whose required `x`, `y`, `width`, or `height` is missing or non-finite. Its error must name the element id and type plus every invalid field; it must not guess metrics for Helvetica or repair note content silently.
2. Enforce that validator at both canonical boundaries. In `src/core/board-write.ts`, validate the complete request-local document after `applyElementInput` and document settlement but before held state, note persistence, broadcasts, or the success response, preserving atomic refusal for agent, human, batch, import, save, and other write mutations. In `src/core/board-io.ts`, validate scenes during `ingestScene` so a malformed legacy note is refused before any pane receives it; map the typed geometry error in `src/server.ts` to an actionable 400 response that the existing board-open UI displays.
3. Harden pane telemetry in `frontend/src/canvas/useCanvasSession.ts`: construct reports only from finite rectangle and viewport values, suppress an invalid report before JSON can turn numbers into `null`, and keep the report unpublished so a later finite scene or camera change can register again. In `src/server.ts`, include the first Zod issue path such as `viewport.x` in the 400 response while keeping the existing pane schema.
4. Extend focused regression coverage instead of adding a fourth browser suite. In `scripts/check-geometry.mjs` and `scripts/check-boards.mjs`, reproduce the auto-resizing `fontFamily: 2` text with missing dimensions, prove a mixed valid/invalid write leaves the note byte-identical, cover missing and non-finite required geometry across write paths, verify a malformed legacy note returns the explicit element/field error, and assert invalid pane telemetry names its field path.
5. Extend `scripts/check-fixed-point.mjs` with the shipped frontend and real headless Excalidraw: plant the malformed legacy note, verify board opening shows the explicit error while zoom stays finite and no `%NaN%` appears, correct the note, reopen it, then prove the board renders and `/api/panes` registers a finite viewport. Exercise one rejected non-finite pane report followed by a corrected camera report to prove recovery. Update `docs/agents/test-suite.md` to record this added fixed-point responsibility.
6. Validate with the focused geometry and board checks, `bun run type-check`, `bun run test:browser` headlessly, then the full `bun run test` chain with the three browser checks kept sequential.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved plan at the canonical ingest and write boundaries. The complete request-local live document is validated before held state, persistence, broadcast, or success; malformed legacy notes retain their bytes and use the board-open error path. Browser telemetry now suppresses non-finite local reports and remains able to publish corrected finite state. Validation: test:geometry 87 checks; test:boards passed; type-check passed; test:browser passed with visible legacy-note error, finite zoom, telemetry suppression and recovery, successful corrected registration, and zero Excalidraw diff; test:live-session passed 42 mixed-write cycles; full sequential bun run test passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rejected missing or non-finite live render geometry atomically at board ingest and write boundaries, kept malformed legacy notes visible through the existing board-open error path, and hardened pane telemetry suppression and recovery. Verified with focused geometry, board, type, browser, and live-session checks plus the complete sequential bun run test suite.
<!-- SECTION:FINAL_SUMMARY:END -->
