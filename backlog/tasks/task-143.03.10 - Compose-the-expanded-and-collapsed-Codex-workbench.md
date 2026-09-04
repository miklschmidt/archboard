---
id: TASK-143.03.10
title: Compose the expanded and collapsed Codex workbench
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 12:49'
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
- [x] #2 A lease-owned app-global approval/input request remains visible and actionable when another pane is focused or navigation changes; its immutable source is shown and no action retargets it.
- [ ] #3 Keyboard order, focus transitions, screen-reader landmarks, reduced motion, light/dark/high-contrast, 44px touch targets, overflow, and empty/loading/error states follow the aesthetic contract.
- [x] #4 The frame consumes module ports only and owns no process/session/timeline/queue/approval/coordinator state.
- [x] #5 Frame module tests prove one/two-pane, collapsed, fullscreen, app-global request visibility, captured-source routing, focus order, and empty/loading/error projections; TASK-143.03.13 owns rendered browser coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a narrow public workbench-frame contract for a controlled expanded/collapsed desktop projection: pane count, workspace/fullscreen presentation, immutable active-pane identity, module-owned transport/controllers, board-status props, and an optional lease-owned app-global request source whose pane identity and transport stay paired.
2. Compose the existing module-root ports into a workhorse-first frame: runtime-backed timeline and composer first; board claim/doing and queue beside that workhorse; thread-link and read-only coordinator history/settings as secondary regions; keep the app-global request region outside collapse/navigation hiding and label it with the exact originating pane.
3. Implement flat semantic Tailwind composition for one/two-pane desktop and Flip-sized hosts through explicit data attributes and grid/overflow rules, controlled disclosure, logical landmarks/focus order, 44px controls, reduced-motion tokens, and forced-color-safe boundaries without owning process, session, timeline, queue, approval, or coordinator state.
4. Add focused workbench-frame tests on the shared Happy DOM stack for one/two-pane, expanded/collapsed, fullscreen, exact source labels, app-global request persistence and captured-source command routing across active-pane rerenders, keyboard/focus order, landmarks, and loading/empty/error projections.
5. Run the focused frame tests, root and frontend TypeScript projects, scoped Oxlint/Oxfmt, repository boundary/inventory owners only if new files require them, and git diff --check; record objective evidence without checking acceptance criteria or moving the task from In Progress.

Rereview remediation (2026-09-04):
6. Subscribe the app-global request owner to its source transport once, validate the captured source against that exact emitted BrowserWorkbenchState snapshot, and pass the same state into WorkbenchApprovals so source disclosure and action availability change in one render.
7. Strengthen the opaque capture to retain the complete frozen pane identity and originating transport reference, rejecting same-id relabeling, transport substitution, or lease-pane drift.
8. Replace the arbitrary request max-height utility with the smallest named module-owned semantic allocation that preserves the bounded flex layout, then add mutable lease and same-id relabel regressions and run only the allowed focused checks.
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

Review remediation (2026-09-04):
- Internal frame allocation now uses a full-height flex column with a min-h-0 flex-1 work area and a shrink-0, max-h-[40%], independently scrollable application-wide request rail. A long retained request owner verifies the request remains in the frame allocation instead of being clipped by work-area overflow.
- captureWorkbenchFrameRequestSource now captures pane identity and transport from one pane port behind an opaque symbol brand. The frame revalidates the captured identity and current transport lease before rendering actions; mismatched identity/transport construction throws, and a tampered displayed identity renders an error with no Approve action.
- The frame shell and app-global wrapper no longer introduce competing semantic headings. The workbench timeline owns the sole h1, downstream module headings follow without skipped levels, and the duplicate workhorse header is removed.
- Compact workhorse status now prioritizes reconnecting, backoff, and stale_snapshot transport state over a retained snapshot thread-link status. Focused retained-snapshot fixtures cover all three states.

Remediation validation:
- bun test --isolate src/ui/workbench-frame/tests — 10 pass, 0 fail, 114 assertions.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- bunx oxlint src/ui/workbench-frame && bunx oxfmt --check src/ui/workbench-frame — pass.
- focused repository policies (boundaries, test inventory, assistant-ui imports, assistant-ui test observer imports) — 75 pass, 0 fail, 426 assertions.
- git diff --check — pass.

The accepted jsx-a11y/no-noninteractive-tabindex suppression remains narrowly scoped to the named focusable native overflow rail. Status remains In Progress and acceptance criteria remain unchecked for independent rereview.

Second rereview remediation (2026-09-04):
- PresentAppGlobalRequest now owns one useSyncExternalStore subscription to the captured source transport. It validates source identity against that emitted BrowserWorkbenchState and passes the same state to WorkbenchApprovals, so the source disclosure and actions change in the same React render. A mutable fixture retargets the lease to Pane A and emits without rerendering frame props; the request changes from present to error while both the Pane B label and Approve action disappear.
- The opaque source capture now retains the exact frozen pane identity object and transport reference. Validation rejects either reference being replaced, including a same-ID relabel, before any action renders.
- The request rail uses the module-owned bounded-half-frame allocation backed by Tailwind max-h-1/2 instead of max-h-[40%]. The focused layout owner asserts the named data contract and its concrete bounded/scroll allocation.

Second remediation validation:
- bun test --isolate src/ui/workbench-frame/tests — 11 pass, 0 fail, 128 assertions.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- bunx oxlint src/ui/workbench-frame — pass.
- bunx oxfmt --check src/ui/workbench-frame — pass.
- git diff --check — pass.

No repository-policy, browser, broad, system, stress, load, capacity, performance, tooling, topology, or concurrency lane was run. TASK-143.03.11 still owns definite outer height and shell mounting; TASK-143.03.13 owns real-browser measurement. Status remains In Progress and every acceptance criterion remains unchecked for independent rereview.

Finalization evidence (2026-09-04):
- Independent reviewer thread 01a06c5b-e580-7d22-967d-726c8abf141b returned REVIEW_CLEAN for fixed range aeb12be2f91493611fee4b2eb3f74a93c5517c60..ed4924b646a2c1109479fd4df083e2b475810bdf.
- AC #2 is checked from the focused navigation, captured-target dispatch, mutable lease-retarget, cross-transport, and same-ID relabel owners. They prove the request remains application-global, names one immutable source, dispatches only through that source, and revokes both its label and action when authority moves.
- AC #4 is checked from the reviewed frame contract and passing root/frontend type checks. The frame accepts existing module-root transports, controllers, timeline inputs, and board-status inputs without creating process or domain state.
- AC #5 is checked from bun test --isolate src/ui/workbench-frame/tests: 11 pass, 0 fail, 128 assertions. The owner covers one/two-pane, expanded/collapsed/fullscreen, request persistence and captured routing, focus order, and loading/empty/error projections.
- AC #1 remains unchecked because TASK-143.03.13 owns rendered desktop and Flip sizing. AC #3 remains unchecked because TASK-143.03.13 owns actual scrolling, themes, forced colors, reduced motion, and touch verification. TASK-143.03.11 owns shell mounting and definite outer height. Those later owners were not run or claimed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Composed the controlled expanded, collapsed, and fullscreen Codex workbench from existing module ports. The frame keeps approval requests bound to their exact source transport, updates authority reactively, preserves a workhorse-first accessible DOM hierarchy, and uses a bounded semantic request allocation. Focused frame tests pass 11 cases with 128 assertions, both TypeScript projects and scoped lint/format pass, and the independent reviewer returned REVIEW_CLEAN at ed4924b646a2c1109479fd4df083e2b475810bdf. Rendered shell sizing and browser-specific visual behavior remain assigned to TASK-143.03.11 and TASK-143.03.13.
<!-- SECTION:FINAL_SUMMARY:END -->
