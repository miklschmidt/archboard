---
id: TASK-101
title: >-
  The pane's change reporting has no interface: eleven refs, invariants in
  comments, and a browser check as the only proof
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 15:00'
updated_date: '2026-08-23 15:02'
labels: []
dependencies: []
references:
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/loss-canary.ts
  - frontend/src/canvas/changes.ts
  - scripts/check-live-session.mjs
  - docs/adr/0016-one-writer-at-a-time-per-board.md
priority: high
type: enhancement
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One state machine — "a person's pending edit is in a report in flight or a report is scheduled, never neither" — lives across eleven `useRef` slots in `frontend/src/canvas/useCanvasSession.ts` (:321–389): baseline, scene stamp, local-edit count, report and retry timers, in-flight flag, the applying-a-server-update count, the record queue of server updates, the whole-scene-report flag. It is not a module: it has no interface, so the invariants are held by comments (:346, :369, :588, :1078) and by discipline at four sites that must call `settle()` before and `recordDelivery()` after every `updateScene` (a fifth, the viewport write at :1298, bypasses both). The only witness that the contract holds is a runtime detector (`loss-canary.ts`) read by a 1,354-line headless-Chrome check (`check-live-session.mjs`). The machine just churned (TASK-099) and it guards the invariant the product stands on — a person's edit is never lost.

Architecture review 2026-08-23, candidate 1 (top recommendation). The hooks remaining concerns — socket, board adoption, lock, selection, pane geometry, export, viewport, mermaid — and the server-stated status (hold, written elsewhere, doing, lock holder) stay in the hook.

Decided in the grilling session with Mikkel, 2026-08-23:
- The whole pipeline from a user edit to the server's reply being applied moves into one pure-TypeScript module, `frontend/src/canvas/change-reporting.ts`, with no React and no Excalidraw imports.
- It is a pure reducer: `reduce(state, event) -> { state, effects }`. Events carry scene snapshots; the reducer computes the change report (`diffAgainstBaseline`) and the TASK-098 text-id renames itself. The hook holds the state in one ref and executes effects in one exhaustive `switch` (`assertNever` default). Two adapters, `scene` (Excalidraw) and `server` (`reportChanges`), with in-memory fakes in the check. No timer adapter: starting and cancelling timers are effects.
- One apply path: every programmatic `updateScene`, including the `set_viewport` appState write, goes through one hook function that emits the events.
- Names are literal, never metaphorical: "delivery" becomes *server update*; "rebase" (not a git analogue — it replaces the held copy with the pane's scene, merging nothing) becomes *full report* vs *delta report*, and the wire flag on `/api/elements/changes` is renamed with it; "hand", "glass", "debt", "owed", "window" are translated in every file this work touches. CONTEXT.md gains **Pending edits**, **Baseline**, **Change report** under *Working*.
- `loss-canary.ts` and `window.__abLoss` are test-time only. They are left exactly as they are through the rewrite, and removed once `test:live-session` passes clean without them. No change to how they fire.
- Order: reducer and its headless check first, then the hook rewired in one step, then the three browser checks as the proof, then the detector removed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `frontend/src/canvas/change-reporting.ts` exports a pure reducer with no React or Excalidraw imports, and `useCanvasSession.ts` holds its state in one ref and executes effects in one exhaustive switch
- [ ] #2 Every programmatic `updateScene` in `useCanvasSession.ts`, including the `set_viewport` appState write, goes through one apply function; no second path sets the applying count by hand
- [ ] #3 `scripts/check-change-reporting.mjs` (`test:reporting`, in the `test` chain) drives the reducer headlessly through: own reply landing after a further user edit; a server update applied while a report is in flight; a user edit during a server update; two overlapping server updates; a refused write followed by a full report; board adoption mid-timer — asserting after every step that pending edits imply a report in flight or scheduled
- [ ] #4 `test:browser`, `test:typing` and `test:live-session` pass, unchanged in what they assert
- [ ] #5 The wire flag `rebase` on `/api/elements/changes` is renamed to the full-report flag in schema, route, client and checks; "delivery" reads *server update*; no "hand", "glass", "debt", "owed" or suppression-"window" remains in the files this work touches
- [ ] #6 CONTEXT.md defines Pending edits, Baseline and Change report under Working
- [ ] #7 `loss-canary.ts` and `window.__abLoss` are removed, and `check-live-session.mjs` no longer creates or reads it, after `test:live-session` has passed clean without them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write `frontend/src/canvas/change-reporting.ts`: state type, event union, effect union, `initialState`, `reduce`. Port the logic of `scheduleReport`/`due`, `sendReport`, `settle`/`recordDelivery`, the three apply paths, `settleForeignTextIds`, `hasPendingChanges`, `flushWithBeacon`'s report, and `adoptBoard`'s reset. Durations come from `src/core/timing.ts` and ride in effects.
2. Write `scripts/check-change-reporting.mjs` (`test:reporting`, added to the `test` chain): an in-memory scene, a scripted server, a manual clock; drive the overlap cases and assert after every step that pending edits imply a report in flight or scheduled.
3. Rewire `useCanvasSession.ts`: one state ref, one `applyServerUpdate` function for every programmatic `updateScene` (viewport included), one effect executor with `assertNever`. Delete the eleven refs and the late-bound `scheduleReportRef` cycle.
4. Rename `rebase` -> full report on the wire: `ElementChangesSchema`, the route, `canvas-client`, checks. Rename delivery -> server update. Translate the metaphor comments in touched files.
5. Run `test:browser`, `test:typing`, `test:live-session` (one after another, headless).
6. Remove `loss-canary.ts`, `window.__abLoss` and `check-live-session`'s use of it once it passes clean. Add the three CONTEXT.md terms.
<!-- SECTION:PLAN:END -->
