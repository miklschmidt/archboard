---
id: TASK-117
title: Prevent malformed text geometry from blanking a board
status: Done
assignee:
  - '@codex'
created_date: '2026-08-25 11:34'
updated_date: '2026-08-25 12:39'
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
  - src/core/apply-element-input.ts
  - src/core/board-write.ts
  - src/core/board-io.ts
  - src/server.ts
  - src/types.ts
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/CanvasPane.tsx
  - frontend/src/shell/Shell.tsx
  - frontend/src/types.ts
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

7. Add red server and browser coverage for a malformed persisted scratch note at initial startup. Startup must preserve the note, keep the canvas usable, retain the error for the scratch pane, and never ingest the malformed scene into Excalidraw.

8. Move render-geometry validation into applyElementInput and validate again after writeBoardContent final settlement, directly against the exact BoardContent passed to persistence. Add public-boundary tests proving applyElementInput never returns malformed elements and settled mutations cannot bypass the guard.

9. Replace TASK-117 browser sleeps and raw polling intervals with constants from src/core/timing.ts plus observable wait helpers. Wait past PANE_DEBOUNCE_MS by a named margin for suppression and poll the server's finite pane state for recovery.

10. Make telemetry recovery restore the exact previously published rounded rect and viewport payload, proving the invalid branch clears the published key before the identical finite report is retried. Then rerun focused checks and the full sequential suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved plan at the canonical ingest and write boundaries. The complete request-local live document is validated before held state, persistence, broadcast, or success; malformed legacy notes retain their bytes and use the board-open error path. Browser telemetry now suppresses non-finite local reports and remains able to publish corrected finite state. Validation: test:geometry 87 checks; test:boards passed; type-check passed; test:browser passed with visible legacy-note error, finite zoom, telemetry suppression and recovery, successful corrected registration, and zero Excalidraw diff; test:live-session passed 42 mixed-write cycles; full sequential bun run test passed.

Review reopened the task. The previous implementation missed malformed scratch during initial adoption, placed the main validation outside applyElementInput and before final writeBoardContent settlement, used raw browser timing, and did not prove same-key telemetry recovery.

Review remediation completed test-first. Red evidence: test:geometry showed applyElementInput returned and retained public-helvetica; test:boards showed writeBoardContent persisted the malformed post-settlement document and malformed scratch never listened; test:browser showed adoptScratchBoard threw through boardElementCount before startup. The final implementation isolates and validates applyElementInput, validates settleBoardContent after final settlement and before holds/answers, revalidates inside writeBoardContent, and starts malformed scratch with an empty render message plus a held visible board error while keeping note bytes unchanged. Browser waits now derive from timing.ts. The recovery probe waits PANE_DEBOUNCE_MS plus a named margin, sends zero invalid POSTs, restores the exact previous rounded rect and viewport, observes the matching POST, and observes the server pane timestamp advance. Final validation: test:geometry 89 checks passed; test:boards passed; type-check passed; test:browser passed with malformed scratch startup, visible error, no malformed Excalidraw elements, same-key telemetry recovery, and zero diff; test:live-session passed 42 cycles; full sequential bun run test passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the review gaps by making malformed scratch startup non-fatal and visibly actionable without changing its note, moving geometry validation into applyElementInput with atomic public output, guarding the post-settlement document at hold and persistence boundaries, and proving timing-coupled same-key pane recovery. Focused checks and the complete sequential suite pass.
<!-- SECTION:FINAL_SUMMARY:END -->
