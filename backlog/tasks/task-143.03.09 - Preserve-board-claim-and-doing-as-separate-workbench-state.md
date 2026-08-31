---
id: TASK-143.03.09
title: Preserve board claim and doing as separate workbench state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-08-31 18:24'
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
  - tests/system/browser/support/semantic-accessibility.ts
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

6. Remediate review: move take-back pending and settled state into Shell agentStates by pane, stamp each operation with a monotonic token, ignore stale settlements, and pass takeBackState as a controlled view input.

7. Put semantic state, label, and detail in one atomic status region, using alert only for refused delivery; add exact-role/text module assertions and a delayed Pane A settlement browser case that proves Pane B remains idle.

8. Keep one semantic announcer mounted beside the workbench summary outside the hidden disclosure body, render expanded semantic detail as non-live presentation, and verify collapsed polite and refused transitions through the browser accessibility tree without changing visual geometry.

9. Supersede step 8 browser evidence: remove direct announcer mutation, prove only the real collapsed Unavailable state through Chrome accessibility data, and defer rendered Fresh and Refused transition coverage to TASK-143.06.02, which owns the semantic delivery source.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation complete for independent review. Added the closed board-status projection and moved the TASK-140 workbench view into its owned module; shell composition now passes focused-pane connection, durable claim, doing history, and explicit take-back results without Codex execution state. Validation passed: 8 module tests / 106 expectations; both TypeScript projects; scoped Oxlint and Oxfmt; frontend build; repository inventory (39 tests); focused shell-layout browser owner (241 expectations); focused claim-interaction browser owner (88 expectations), including pending/success/failure, keyboard focus, both themes, semantic default, and unchanged note bytes. Direct in-app visual inspection at 1440x900 passed in light and dark with no root/body overflow and a 44px take-back target. The broader boundaries and module-scope repository owners exceeded the mandated 6 GiB cgroup and were OOM-killed; directly applicable scoped lint and inventory remained green. Task intentionally remains In Progress with acceptance criteria unchecked for parent review.

Independent-review remediation complete. Shell now owns take-back pending and settled state in its pane-keyed agentStates, keys it to the pane board and durable claim, and stamps operations so a stale completion cannot replace newer pane state. WorkbenchBoardStatus receives controlled state and keeps no local settlement lifecycle. Semantic label and detail now share one atomic accessible region; refused is alert/assertive and the other five states are status/polite. Validation passed: module 8 tests / 124 expectations; both TypeScript projects; scoped Oxlint and Oxfmt; frontend build; shell-layout browser owner 241 expectations; claim-interaction browser owner 94 expectations, including delayed Pane A settlement while Pane B stays idle before and after completion and Pane A alone announces success. Board-note immutability and both themes remain covered. Per parent direction, the known 6 GiB OOM boundaries and module-scope lanes were not rerun; their prior OOM evidence is preserved. Task remains In Progress with ACs unchecked.

Remediation 2 (2026-08-31): Kept exactly one atomic semantic announcer mounted outside the collapsed hidden disclosure body, with refused exposed as alert/assertive and every other state as status/polite. The expanded semantic detail is visual and non-live, so opening the workbench does not duplicate announcements. Module coverage verifies all six closed semantic states, one announcer, hidden-body separation, exact role/live/text, and non-live detail. The real browser owner verifies the workbench remains collapsed, the announcer has no hidden ancestor, and Chrome accessibility data reports exact status/polite/fresh and alert/assertive/refused nodes. Final capped validation passed: module 8 tests/178 assertions; type-check; scoped lint 0/0; scoped format check; frontend build; shell-layout 1 test/241 assertions; claim-interaction 1 test/102 assertions. The previously observed 6G+1G OOM evidence for the boundary and module-scope repository owners is preserved and those owners were not rerun, as requested. Task remains In Progress with acceptance criteria unchecked pending parent rereview.

Remediation 3 correction (2026-08-31): The prior Fresh and Refused browser evidence was synthetic because the owner changed announcer attributes and text directly. Removed that mutation. The browser owner now verifies only the shell state the product really renders here: one collapsed Unavailable announcer outside the hidden disclosure, exposed by Chrome as an unignored atomic status with polite live priority and the exact accessible name. Static module tests still verify React markup for all six closed semantic states, including Refused alert/assertive. A real browser-rendered Fresh to Refused transition is deferred to TASK-143.06.02, the dependency that owns the semantic delivery source. Capped validation passed: module 8 tests/178 assertions; type-check; scoped lint 0/0; scoped format check; frontend build; shell-layout 1 test/241 assertions; claim-interaction 1 test/96 assertions. Known boundary and module-scope OOM evidence remains preserved and was not rerun. Task remains In Progress with acceptance criteria unchecked.
<!-- SECTION:NOTES:END -->
