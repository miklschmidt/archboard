---
id: TASK-109.01
title: >-
  Simplify the pane's change reporting: dead reducer surface, derivable state, a
  mermaid bypass, server calls outside api.ts
status: To Do
assignee: []
created_date: '2026-08-23 19:34'
labels: []
dependencies: []
references:
  - frontend/src/canvas/change-reporting.ts
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/api.ts
  - scripts/check-change-reporting.mjs
parent_task_id: TASK-109
priority: medium
type: chore
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Frontend half of the simplification pass (see TASK-109). Files: `frontend/src/canvas/change-reporting.ts`, `frontend/src/canvas/useCanvasSession.ts`, `frontend/src/canvas/api.ts`, `scripts/check-change-reporting.mjs`. Findings, with line numbers as of commit ccc9049:

EFFICIENCY
- E2 (regression) `change-reporting.ts:318-319`: `stampScene(scene)` runs before the `userInteracted` guard, so a pane nobody has pointed into (wall display, second pane, agent-driven pane) hashes the whole scene on every scroll/zoom/render; before TASK-101 the guard came first. Move `if (!state.userInteracted) return state` above the stamp.
- E7 `change-reporting.ts:210-218`: `hasPendingEdits` builds a full report (allocates nextBaseline + upserts) to answer a boolean; only called on initial_elements/reconnect. Low priority; a first-mismatch scan if cheap.

ALTITUDE
- A6 `useCanvasSession.ts:749-751`: `releaseIfIdle` reads `state.reportTimerScheduled || state.retryTimerScheduled` — the hook re-derives "gesture over" from reducer internals, so the rule is half in the reducer (checked headlessly) and half in the hook (not). Have the reducer emit the release only when its own state says idle, or export a `reportsSettled(state)` predicate like `hasPendingEdits`. Same shape at :803 (`state.userInteracted`) and :1006 (`state.fullReportNeeded`): two exported predicates.
- A7 `useCanvasSession.ts:425-428, 976-979`: `applySceneUpdate`'s optional second parameter exists so the mermaid path can write the scene without the reducer seeing it; the doc comment says it is the only programmatic scene write. Add a reducer event for a local programmatic edit so mermaid goes through `dispatchReporting`; make the parameter mandatory.
- A-minor `change-reporting.ts:62,70,97`: `kind: string` threaded through three events and read by nothing — give it a consumer or delete. `:65` `reportAfterUpdate` on the public `server_update_requested` event is only set internally — move it to the internal events. `:102` `delayMs: 0` literal type on the retry effect — drop; the hook picks the mechanism.

SIMPLIFICATION
- S1 `change-reporting.ts:220` `pendingChangeReport` exported, zero callers: delete. S2 `:153` `stampScene` and `:35` `ServerUpdateRecord` exported but module-internal: un-export.
- S12 `:46,:51` `reportInFlight` and `inFlightReport` always move together: delete the boolean, guard on `inFlightReport !== null` (and the check's :170).
- S13 `:27,:400` `ReportContext.generation` duplicates `state.generation` (generation only changes in board_adopted, which resets inFlightReport): drop the field and the third clause of the guard.
- S14 `:35-37,:373-375,:392` `ServerUpdateRecord` is a one-field wrapper around a string: `serverUpdateStamps: readonly string[]`.
- S15 `:206-208` `withheldSet` both branches identical: `new Set(ids)`. S16 `EMPTY_WITHHELD` declared in both files (`useCanvasSession.ts:78`, `change-reporting.ts:115`): export once.
- S8 `useCanvasSession.ts:757` `withheldIds` is a pure forwarder to `currentWithheldIds` with one call site (:1023): inline. S10 `:575-576` `const api = apiRef.current` unused after the guard.
- S21 `change-reporting.ts:339-349` + `useCanvasSession.ts:455-482`: report/retry timer arms are near-identical twins — parameterise on `which: report|retry` for start/cancel in the hook and a shared `timerFired(state, which)` helper in the reducer; do NOT merge the two reducer cases into one label (clearing the other flag changes what `beginReport` cancels).
- S22 `change-reporting.ts:429-455` `report_refused` / `report_failed` share 12 of 14 lines: one `afterFailedReport(state, effects, { delayMs, fullReport, publish })`.
- S7 `scripts/check-change-reporting.mjs:96,:166` `Harness.assertion` written, never read: delete.

REUSE
- R2 `useCanvasSession.ts:577-584` vs `change-reporting.ts:410-413`: the withheld-carryover filter (`withheld.has(id) && !answered.has(id)`) computed in both files — export `carryWithheld(scene, answered, withheldIds)` from the reducer module and use it in `applyServerScene`.
- R7 `useCanvasSession.ts:521-536, 783-795, 864-869, 903-908`: four server calls outside `api.ts`, whose header (new in this diff) says every server call lives there: `send_beacon` rebuilds `reportChanges`' URL/payload (add `beaconChanges(board, report, clientId)` beside `reportChanges`, sharing its builder); `publishSelection` and the two identical inline `respond()` helpers hand-roll `fetch POST` — add `publishSelection`/`postExportResult`/`postViewportResult` on top of `api.ts`'s `post`.
- R-minor `scripts/check-change-reporting.mjs:199-216` copies the hook's `applyServerElements` merge verbatim — either a shared pure `mergeIncoming()` used by both, or a comment saying the check models it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every finding above is fixed or listed in the notes as skipped with a one-line reason; no behaviour changes
- [ ] #2 `bun run test:reporting` passes with the same or more cases; `bun run build` and the frontend type-check pass
- [ ] #3 `change-reporting.ts` exports only what the hook or the check imports
<!-- AC:END -->
