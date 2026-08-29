---
id: TASK-139
title: Present one canvas in fullscreen
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-29 16:19'
updated_date: '2026-08-29 16:57'
labels: []
dependencies: []
priority: medium
type: feature
ordinal: 155000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person presenting an architecture board needs a distraction-free view of one chosen canvas. The frontend should enter a presentation mode that hides the application shell and every other pane while preserving the live board session and making the selected canvas fill the available display.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can enter fullscreen presentation mode for the currently chosen canvas through a clear frontend control.
- [ ] #2 Presentation mode hides the shell, navigation, controls, and every non-selected canvas while the selected canvas fills the available display.
- [ ] #3 At most one canvas is presented at a time; choosing another canvas transfers presentation instead of creating a second fullscreen canvas.
- [ ] #4 Exiting presentation restores the prior shell and pane layout without losing the open boards, live connection, selection, or unsaved held state.
- [ ] #5 Keyboard and visible controls provide an accessible exit, and fullscreen refusal or loss returns to an accurate non-presenting state.
- [ ] #6 Rendered browser coverage proves enter, single-canvas exclusivity, transfer, exit, and state restoration through the user interface.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Serialize this task behind TASK-138 before source work. TASK-139 depends on TASK-138. Wait for the parent to identify the landed TASK-138 commit, then rebase this detached worktree onto that commit before editing source. Re-read the landed serial-browser inventory in `package.json` and `tests/system/browser/support/agent-browser.ts`, plus `docs/agents/test-suite.md`, `tests/system/repository-policy/test-inventory.test.ts`, and `.github/workflows/ci.yml`. If TASK-138 changed the expected inventory contract or left CI in flight, stop for parent reconciliation.

2. Write red tests in two dedicated owners, each below 500 lines. Add `src/ui/shell/tests/fullscreen-presentation.test.ts` for the browser API coordinator. Add `tests/system/browser/fullscreen-presentation.test.ts` as one observable rendered-workflow owner rather than growing `tests/system/browser/shell-layout.test.ts` or the already pressure-bound `tests/system/browser/human-hold-persistence.test.ts`. After the TASK-138 rebase, register the new browser owner in the two canonical inventory files `package.json` and `tests/system/browser/support/agent-browser.ts`, and update the exact owner count and order in `docs/agents/test-suite.md`. Do not weaken, split across ad hoc lanes, or bypass the serial adapter.

3. Add `src/ui/shell/fullscreen-presentation.ts` as the sole Fullscreen API and presentation-state owner. Browser truth is exactly `root.isConnected && root.ownerDocument.fullscreenElement === root`, and `fullscreenchange` is listened for on `root.ownerDocument`. A Present click calls `root.requestFullscreen()` synchronously before yielding. The module keeps at most one latest target pane ID plus non-identity lifecycle bookkeeping, replaces that target on dock transfer, and reconciles every request or exit completion against current DOM truth. A stale successful request presents the latest still-valid target or immediately calls an ownership-checked exit when no target remains. Request or exit rejection keeps presentation only when the root still owns fullscreen; browser-driven loss clears it even if `exitFullscreen()` later rejects. A disconnected or removed root clears presentation and requests exit only when that exact root still owns fullscreen. Disposal detaches the owner-document listener, invalidates pending operations, publishes nothing after disposal, and never blindly exits fullscreen, so React StrictMode setup and cleanup are safe.

4. Make the module owner exercise synchronous request dispatch, ordinary entry and same-root transfer, overlapping requests, Escape during pending entry, a stale success after a newer refusal, native loss, entry refusal, exit refusal while the root still owns fullscreen, exit rejection after browser-driven loss, disconnected and removed roots, and StrictMode-style dispose and recreate. The fake owner document will assert listener attachment and detachment, operation invalidation, latest-target reconciliation, and that disposal itself makes no exit call.

5. Update `src/ui/shell/Shell.tsx` only as composition and recovery UI. It gives the module the existing shell root and renders a clear Present action for the focused pane plus a presentation-only segmented dock for transfer and Exit. Dock transfer also updates the existing `focused` pane so the restored chrome names the pane the presenter chose. When an external pane-close request targets the presented pane, Shell first transfers presentation and focus to the surviving mounted pane, then removes the target and requests exit; if exit is refused, the survivor still fills the display instead of leaving a blank shell. Entry failures use the existing visible notice. Failures while fullscreen render a persistent `role="alert"` inside the dock beside still-operable transfer and Exit controls, so a refused exit remains visible and a later Exit or Escape can recover. Entry focuses the dock and exit restores focus to Present.

6. Update `src/ui/canvas/CanvasPane.tsx` only with derived presentation attributes on the same mounted `section`. A non-presented pane is both `aria-hidden="true"` and inert; do not change `useCanvasSession`. Update `src/ui/shell/Icons.tsx` with one code-native fullscreen glyph. Make `src/ui/shell/shell.css` the only visual and layout owner. Every hiding or fill rule is gated by confirmed `.shell.shell-presenting:fullscreen`; pending or refused entry leaves the normal shell visible. Confirmed presentation hides the header, navigator, status bar, activity rail, normal pane bar, notices, dialogs, non-presented pane, and Excalidraw layer controls, while the selected mounted pane occupies the fullscreen viewport and the dock stays visible with 44-pixel targets and focus-visible treatment. No pane key, subtree, Excalidraw API, socket, pending report, selection, or held state is recreated.

7. In `tests/system/browser/fullscreen-presentation.test.ts`, drive the visible UI through native entry, transfer, exit refusal with an on-screen dock alert, later successful Exit, re-entry and real Escape, deterministic entry refusal, and external close of the presented pane. Before entry, capture both pane DOM nodes and the exact `/api/panes` registration: two client IDs, two board IDs, focused pane, selection, and rectangles, plus an actual held-board response. During presentation assert `document.fullscreenElement` is the shell root, exactly one pane fills the viewport, the other is hidden, inert, and reports a zero rectangle, registration count stays two, client and board IDs stay unchanged, selection and held data stay exact, and transfer changes both presentation and the existing focused-pane report. After each exit wait for and assert the same DOM nodes, live registrations, client and board IDs, selection, held data, focused pane, and exact pre-entry rectangles. The external-close case stubs exit refusal and proves the survivor is selected, visible, connected, and recoverable before the eventual exit.

8. Keep every new TS or TSX file and every modified test file below 500 lines. If the dedicated rendered owner approaches that limit, extract setup or polling into one focused support module below 500 lines. Do not add assertions to `tests/system/browser/human-hold-persistence.test.ts`; its current size leaves no safe room. Re-read all touched tests before accepting further scope.

9. Validate only after rebasing onto landed TASK-138. Run `bun test src/ui/shell/tests/fullscreen-presentation.test.ts`, `bun run type-check`, `bun run lint`, `bun run fmt:check`, `bun run test:repository`, and `bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/fullscreen-presentation.test.ts`. Then run `bun run check` as the full acceptance gate against the reconciled owner inventory. Audit exact file sizes, task metadata, ignored or generated residue, the final diff, and detached worktree status before committing.
<!-- SECTION:PLAN:END -->
