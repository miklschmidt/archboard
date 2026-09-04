---
id: TASK-143.03.11
title: Integrate the Codex workbench into the operator shell
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 13:13'
labels: []
dependencies:
  - TASK-143.03.10
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - src/ui/shell/tests/codex-workbench-integration.test.tsx
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
- [ ] #1 Shell.tsx mounts one workbench per eligible pane through the accepted frame, preserves Excalidraw ownership, pane/navigator/status/claim/doing flows, and introduces no second shell/workbench store.
- [ ] #2 The existing PresentationDock identifies the active text pane/workhorse/turn and keeps a labelled Stop control reachable in fullscreen without changing fullscreen ownership or inventing a second dock.
- [ ] #3 CSS consumes the semantic aesthetic contract for desktop, two-pane, collapsed, fullscreen, high contrast, reduced motion, and Flip touch without default assistant-ui/shadcn styling.
- [ ] #4 The named module test covers one registration, source identity, fullscreen Stop routing, unmount/reload, and unchanged shell/canvas behavior; TASK-143.03.13 owns rendered browser behavior.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the accepted WorkbenchFrame contract, its runtime source routing, the existing shell pane lifecycle, and PresentationDock ownership.
2. Mount exactly one accepted WorkbenchFrame for each eligible pane, extending the existing dock with exact active pane, workhorse, and turn identity plus its existing fullscreen owner's Stop route.
3. Add the focused shell module owner for registration, source identity, Stop routing, unmount or reload, and unchanged canvas ownership.
4. Run only the focused shell and workbench owners, root and frontend type checks, scoped Oxlint and Oxfmt, the frontend build, and final diff and tracked-file audits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint 1f8321e9:
- Shell now assembles one accepted WorkbenchFrame from each pane's exact session-owned BrowserWorkbenchTransport and existing composer, thread-link, status, claim, doing, and take-back ports. CanvasPane adds one registration callback and unregisters replacements and unmounts; socket and transport ownership remain in useCanvasSession.
- The existing PresentationDock now shows the presented pane, workhorse thread, and active turn, and routes its labelled Stop control through that exact pane's existing composer controller. The existing fullscreen owner is unchanged.
- Focused validation: 23 tests pass across codex-workbench-integration, fullscreen-presentation, and workbench-frame with 184 assertions; root and frontend TypeScript pass; scoped Oxlint and Oxfmt pass; build:frontend passes with only the pre-existing chunk-size advisory; git diff --check passes.
- No browser, broad normal, system, stress, load, capacity, performance, tooling, topology, or concurrency lane ran. TASK-143.03.13 retains rendered browser behavior. Acceptance criteria remain unchecked and status remains In Progress for parent review.
<!-- SECTION:NOTES:END -->
