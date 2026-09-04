---
id: TASK-143.03.11
title: Integrate the Codex workbench into the operator shell
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 13:34'
labels: []
dependencies:
  - TASK-143.03.10
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/canvas/tests/workbench-transport-publication.test.tsx
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/shell/tests/codex-workbench-integration-support.ts
  - src/ui/shell/tests/codex-workbench-integration.test.tsx
  - src/ui/workbench-frame/contract.ts
  - src/ui/workbench-frame/lib/WorkbenchFrame.tsx
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 208000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integrate the accepted text workbench frame into the existing operator shell and extend the existing PresentationDock with the active text source and Stop action. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shell.tsx mounts one workbench per eligible pane through the accepted frame, preserves Excalidraw ownership, pane/navigator/status/claim/doing flows, and introduces no second shell/workbench store.
- [x] #2 The existing PresentationDock identifies the active text pane/workhorse/turn and keeps a labelled Stop control reachable in fullscreen without changing fullscreen ownership or inventing a second dock.
- [x] #3 CSS consumes the semantic aesthetic contract for desktop, two-pane, collapsed, fullscreen, high contrast, reduced motion, and Flip touch without default assistant-ui/shadcn styling.
- [x] #4 The named module test covers one registration, source identity, fullscreen Stop routing, unmount/reload, and unchanged shell/canvas behavior; TASK-143.03.13 owns rendered browser behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the accepted WorkbenchFrame contract, its runtime source routing, the existing shell pane lifecycle, and PresentationDock ownership.
2. Mount exactly one accepted WorkbenchFrame for each eligible pane, extending the existing dock with exact active pane, workhorse, and turn identity plus its existing fullscreen owner's Stop route.
3. Add the focused shell module owner for registration, source identity, Stop routing, unmount or reload, and unchanged canvas ownership.
4. Run only the focused shell and workbench owners, root and frontend type checks, scoped Oxlint and Oxfmt, the frontend build, and final diff and tracked-file audits.

Rereview remediation:
5. Retain every registered pane in the frame, extending only the narrowest accepted frame timeline port needed to render unbound and signed-out recovery without inventing a thread identity.
6. Use one active text pane for frame selection, fullscreen dock disclosure, presentation transfer, and Stop dispatch; prove Pane B selection changes the dock and only Pane B receives interrupt.
7. Add the cheapest real CanvasPane callback owner for one publish per transport, null before replacement, and null on unmount.
8. Rerun only focused owners, both TypeScript projects, scoped Oxlint/Oxfmt, the frontend build, and fixed-range cleanliness checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint 1f8321e9:
- Shell now assembles one accepted WorkbenchFrame from each pane's exact session-owned BrowserWorkbenchTransport and existing composer, thread-link, status, claim, doing, and take-back ports. CanvasPane adds one registration callback and unregisters replacements and unmounts; socket and transport ownership remain in useCanvasSession.
- The existing PresentationDock now shows the presented pane, workhorse thread, and active turn, and routes its labelled Stop control through that exact pane's existing composer controller. The existing fullscreen owner is unchanged.
- Focused validation: 23 tests pass across codex-workbench-integration, fullscreen-presentation, and workbench-frame with 184 assertions; root and frontend TypeScript pass; scoped Oxlint and Oxfmt pass; build:frontend passes with only the pre-existing chunk-size advisory; git diff --check passes.
- No browser, broad normal, system, stress, load, capacity, performance, tooling, topology, or concurrency lane ran. TASK-143.03.13 retains rendered browser behavior. Acceptance criteria remain unchecked and status remains In Progress for parent review.

Independent review at dd2b4c0b returned three accepted findings: registered unbound panes were filtered from the frame; fullscreen frame selection could diverge from PresentationDock and Stop; and the production CanvasPane transport callback had no direct owner. Remediation is in progress at the original fixed base. Acceptance criteria remain unchecked.

Rereview remediation checkpoint bb1b6514:
- Registered thread-capable unbound and signed-out pane transports remain in WorkbenchFrame. The frame renders an honest no-thread timeline while preserving thread-link Create, Attach, and account recovery controls without inventing a workhorse identity.
- Workbench pane selection transfers the existing fullscreen presentation owner, so frame selection, PresentationDock identity, canvas presentation, and Stop dispatch share one authoritative pane. The two-pane owner proves Pane B becomes current and only Pane B receives interrupt.
- A mounted production CanvasPane owner proves transport publication is deduplicated, clears before replacement, and clears on unmount.
- Focused validation: 27 tests pass across four owners with 194 assertions; root and frontend TypeScript pass; scoped Oxlint and Oxfmt pass; build:frontend passes with only the existing chunk-size advisory; git diff --check passes. No browser, broad normal, system, stress, load, capacity, performance, tooling, topology, or concurrency lane ran.
- Acceptance criteria remain unchecked and status remains In Progress for parent rereview.

Canonical integration at eba39372 applied the independently review-clean range without conflicts: 1f8321e9 -> 53017346, dd2b4c0b -> 0e70dc69, bb1b6514 -> d5b3af8f, a76502cd -> 4c13defe. The reconciled implementation and task checkpoint are byte-identical to a76502cd on all reviewed paths, while TASK-143.04.03 remains preserved. Final focused evidence: 27 tests across the shell integration, fullscreen presentation, frame layout, and production CanvasPane publication owners passed with 194 assertions; root and frontend TypeScript passed; scoped Oxlint and Oxfmt passed; the frontend build passed with its existing chunk-size advisory; diff checks passed. TASK-143.03.13 still owns rendered browser coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the accepted Codex workbench frame into the canonical operator shell. Every registered pane remains recoverable in one frame, fullscreen canvas, dock identity, pane selection, and Stop share one authoritative pane, and CanvasPane transport publication has a focused lifecycle owner. Verified with 27 focused tests and 194 assertions, both TypeScript projects, scoped lint and formatting, the frontend build, and exact reviewed-range checks.
<!-- SECTION:FINAL_SUMMARY:END -->
