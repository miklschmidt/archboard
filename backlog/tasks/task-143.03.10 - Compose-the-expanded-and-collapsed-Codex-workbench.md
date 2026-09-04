---
id: TASK-143.03.10
title: Compose the expanded and collapsed Codex workbench
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 12:18'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-143.03.04
  - TASK-143.03.05
  - TASK-143.03.06
  - TASK-143.03.07
  - TASK-143.03.08
  - TASK-143.03.09
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-frame
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compose expanded/collapsed workbench layout, app-global request surface, and responsive pane behavior. Delegation profile: gpt-5.6-sol, xhigh because this is substantial UI design governed by the reference mockup.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Expanded and collapsed layouts preserve workhorse-first hierarchy, separate coordinator history/settings, queue, approval, board claim/doing, and exact source-pane labels at one/two-pane desktop and Flip sizes.
- [ ] #2 A lease-owned app-global approval/input request remains visible and actionable when another pane is focused or navigation changes; its immutable source is shown and no action retargets it.
- [ ] #3 Keyboard order, focus transitions, screen-reader landmarks, reduced motion, light/dark/high-contrast, 44px touch targets, overflow, and empty/loading/error states follow the aesthetic contract.
- [ ] #4 The frame consumes module ports only and owns no process/session/timeline/queue/approval/coordinator state.
- [ ] #5 Frame module tests prove one/two-pane, collapsed, fullscreen, app-global request visibility, captured-source routing, focus order, and empty/loading/error projections; TASK-143.03.13 owns rendered browser coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a narrow public workbench-frame contract for a controlled expanded/collapsed desktop projection: pane count, workspace/fullscreen presentation, immutable active-pane identity, module-owned transport/controllers, board-status props, and an optional lease-owned app-global request source whose pane identity and transport stay paired.
2. Compose the existing module-root ports into a workhorse-first frame: runtime-backed timeline and composer first; board claim/doing and queue beside that workhorse; thread-link and read-only coordinator history/settings as secondary regions; keep the app-global request region outside collapse/navigation hiding and label it with the exact originating pane.
3. Implement flat semantic Tailwind composition for one/two-pane desktop and Flip-sized hosts through explicit data attributes and grid/overflow rules, controlled disclosure, logical landmarks/focus order, 44px controls, reduced-motion tokens, and forced-color-safe boundaries without owning process, session, timeline, queue, approval, or coordinator state.
4. Add focused workbench-frame tests on the shared Happy DOM stack for one/two-pane, expanded/collapsed, fullscreen, exact source labels, app-global request persistence and captured-source command routing across active-pane rerenders, keyboard/focus order, landmarks, and loading/empty/error projections.
5. Run the focused frame tests, root and frontend TypeScript projects, scoped Oxlint/Oxfmt, repository boundary/inventory owners only if new files require them, and git diff --check; record objective evidence without checking acceptance criteria or moving the task from In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation evidence (2026-09-04):
- AC #1: WorkbenchFrame composes the active workhorse before its operations; the expanded region contains runtime-backed timeline/composer, board claim/doing, queue, thread link, and separate read-only coordinator history/settings. Collapsed and fullscreen render the same hierarchy as a six-fact compact rail. The one/two-pane controlled tuple and exact Pane A/Pane B labels are covered by frame-layout.test.tsx.
- AC #2: WorkbenchFrameRequest pairs the immutable source pane identity with its originating transport. The application-wide request region remains mounted in expanded, collapsed, and fullscreen projections. The focused test rerenders active navigation between Pane A and Pane B, then approves through Pane B's captured target and proves Pane A receives no command.
- AC #3: The frame uses the canonical semantic Tailwind aliases, flat rules, 44px controls, reduced-motion duration tokens, forced-color-safe boundaries, bounded vertical and horizontal overflow, named landmarks, logical DOM/tab order, focus return on collapse/fullscreen, and honest loading/empty/error states. The compact overflow rail is a named keyboard-focusable native scroll region with a visible semantic focus outline.
- AC #4: The public contract accepts only existing module-root transports, controllers, timeline props, and board-status props. The frame subscribes to those ports and calls their public projectors/components; it creates no process, socket, session, timeline, queue, approval, coordinator, or board domain owner. Repository boundary and assistant-ui ownership policies pass.
- AC #5: src/ui/workbench-frame/tests/frame-layout.test.tsx passes 8 tests and 90 assertions covering one/two pane, expanded/collapsed/fullscreen, compact hierarchy, app-global visibility and captured-source routing, keyboard/DOM order, focus recovery, and workbench/request loading, empty, and error projections.

Independent validation:
- bun test --isolate src/ui/workbench-frame/tests — 8 pass, 0 fail, 90 assertions.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- bunx oxlint src/ui/workbench-frame — pass.
- bunx oxfmt --check src/ui/workbench-frame — pass.
- focused repository policies (boundaries, test inventory, assistant-ui imports, assistant-ui test observer imports) — 75 pass, 0 fail, 426 assertions.
- git diff --check — pass.

Remaining review risk: TASK-143.03.11 still owns allocation of a definite frame height and shell mounting; TASK-143.03.13 owns real-browser verification across desktop/Flip viewports, themes, reduced motion, high contrast, Excalidraw coexistence, and actual horizontal scrolling. No broad suite or browser owner was run here, as required. Acceptance criteria remain unchecked and status remains In Progress for independent review.
<!-- SECTION:NOTES:END -->
