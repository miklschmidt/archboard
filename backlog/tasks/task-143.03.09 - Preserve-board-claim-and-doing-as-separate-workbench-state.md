---
id: TASK-143.03.09
title: Preserve board claim and doing as separate workbench state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-08-31 17:24'
labels: []
dependencies:
  - TASK-143.06.02
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-board-status
  - src/ui/shell/Shell.tsx
  - src/ui/shell/AgentWorkbench.tsx
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/canvas/useCanvasSession.ts
  - tests/system/browser/claim-interaction.test.ts
  - tests/system/browser/support/claim-interaction.ts
  - tests/system/browser/support/workbench-metrics.ts
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the adapter and view for existing focused-pane connection, claim, doing history, semantic-context freshness, and Take back control in `src/ui/workbench-board-status`. This is the successor to the claim/doing-only TASK-140 AgentWorkbench content.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board connection, claim holder/reason, doing history, semantic-context delivery, and Take back control retain existing behavior and remain separate from Codex turn, queue, approval, coordinator, and voice state.
- [ ] #2 Disconnected, reconnecting, unclaimed, claimed, take-back pending/success/failure, semantic fresh/stale/ambiguous/refused/outcome_unknown states are named and never conflated with thread execution.
- [ ] #3 Existing TASK-140 claim/take-back browser assertions remain green; tests at src/ui/workbench-board-status/tests exhaust closed adapter states, accessibility status, keyboard focus, both themes, and no board-note write from presentation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a closed `src/ui/workbench-board-status` projection that keeps focused-pane connection, claim campaign, per-write doing history, take-back lifecycle, and semantic delivery state as independent values with no Codex turn, queue, approval, coordinator, or voice fields.
2. Move the TASK-140 AgentWorkbench view into that module without changing its canvas-first geometry, stable claim/take-back selectors, focused-pane behavior, or board-write boundary; add truthful disconnected/reconnecting, take-back outcome, and semantic status presentation with accessible announcements and keyboard-visible controls.
3. Compose the module through the existing shell and canvas take-back seam only, returning an explicit success/failure result from the current hold/release operation so the view can present pending and settled outcomes without guessing.
4. Add exhaustive projection and static-render tests under the module plus focused real-browser assertions for themes, focus, take-back pending/success/failure, semantic states, preserved TASK-140 behavior, and unchanged board-note bytes during presentation-only interactions.
5. Run focused module and browser owners, frontend build, typecheck, scoped lint/format, repository inventory, and diff/protected-file checks in sequential capped transient systemd user services; keep the task In Progress and acceptance unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete for independent review. Added the closed board-status projection and moved the TASK-140 workbench view into its owned module; shell composition now passes focused-pane connection, durable claim, doing history, and explicit take-back results without Codex execution state. Validation passed: 8 module tests / 106 expectations; both TypeScript projects; scoped Oxlint and Oxfmt; frontend build; repository inventory (39 tests); focused shell-layout browser owner (241 expectations); focused claim-interaction browser owner (88 expectations), including pending/success/failure, keyboard focus, both themes, semantic default, and unchanged note bytes. Direct in-app visual inspection at 1440x900 passed in light and dark with no root/body overflow and a 44px take-back target. The broader boundaries and module-scope repository owners exceeded the mandated 6 GiB cgroup and were OOM-killed; directly applicable scoped lint and inventory remained green. Task intentionally remains In Progress with acceptance criteria unchecked for parent review.
<!-- SECTION:NOTES:END -->
