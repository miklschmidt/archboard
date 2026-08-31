---
id: TASK-143.03.09
title: Preserve board claim and doing as separate workbench state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-08-31 18:28'
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
1. Define a closed src/ui/workbench-board-status projection that keeps focused-pane connection, claim campaign, per-write doing history, take-back lifecycle, and semantic delivery state as independent values with no Codex turn, queue, approval, coordinator, or voice fields.
2. Move the TASK-140 AgentWorkbench view into that module without changing its canvas-first geometry, stable claim/take-back selectors, focused-pane behavior, or board-write boundary. Add truthful disconnected, reconnecting, take-back outcome, and semantic status presentation with accessible announcements and keyboard-visible controls.
3. Compose the module through the existing shell and canvas take-back seam only, returning an explicit success or failure result from the current hold and release operation so the view can present pending and settled outcomes without guessing.
4. Add exhaustive projection and static-render tests under the module for all closed semantic states. Add focused real-browser assertions for themes, focus, take-back pending, success and failure, the actual collapsed Unavailable semantic state, preserved TASK-140 behavior, and unchanged board-note bytes during presentation-only interactions.
5. Run focused module and browser owners, frontend build, typecheck, scoped lint and format, repository inventory, and diff and protected-file checks in sequential capped transient systemd user services. Keep the task In Progress and acceptance unchecked for independent review.
6. Remediate review by moving take-back pending and settled state into Shell agentStates by pane, stamping each operation with a monotonic token, ignoring stale settlements, and passing takeBackState as a controlled view input.
7. Put semantic state, label, and detail in one atomic status region, using alert only for refused delivery. Add exact-role and exact-text module assertions and a delayed Pane A settlement browser case that proves Pane B remains idle.
8. Keep one semantic announcer mounted beside the workbench summary outside the hidden disclosure body, and render expanded semantic detail as non-live presentation without changing visual geometry.
9. This step supersedes the semantic-state browser clause in the prior step 4 and the synthetic-transition browser clause in the prior step 8. This leaf proves only the real collapsed Unavailable state in the shell. TASK-143.06.02 is already Done and owns runtime exact-thread semantic delivery with module and fake-port evidence, not the rendered transition. The open production chain is TASK-143.01.14 for semantic delivery composition, TASK-143.03.10 for workbench composition, and TASK-143.03.11 for shell integration. TASK-143.03.13 owns rendered browser behavior and must prove a real collapsed Fresh-to-Refused React and accessibility transition after that chain lands. That evidence does not expand the accepted source scope of TASK-143.03.09.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation completed for independent review. Added the closed board-status projection and moved the TASK-140 workbench view into its owned module. Shell composition passes focused-pane connection, durable claim, doing history, and explicit take-back results without Codex execution state. The workbench retains TASK-140 selectors, keyboard controls, theme behavior, pane scoping, camera safety, and board-note immutability.

The first remediation moved take-back pending and settled state into pane-keyed Shell agentStates, keyed it to board and durable claim, and stamped operations so a stale completion cannot replace newer pane state. WorkbenchBoardStatus receives controlled state and keeps no local settlement lifecycle. Semantic label and detail use one atomic accessible region. Refused is alert and assertive; the other five states are status and polite.

The second remediation kept exactly one semantic announcer outside the collapsed hidden disclosure body and made expanded semantic detail non-live. Module coverage verifies all six closed semantic states, one announcer, hidden-body separation, exact role, live priority and text, and non-live visual detail.

A later browser attempt manufactured Fresh and Refused by changing announcer attributes and text directly. The third remediation removed that synthetic evidence. Current browser evidence covers only the shell state this leaf really renders: one collapsed Unavailable announcer outside the hidden disclosure, exposed by Chrome as an unignored atomic status with polite live priority and the exact accessible name. Focused validation passed with module 8 tests and 178 assertions, typecheck, scoped lint with no findings, scoped format, frontend build, shell-layout 1 test and 241 assertions, and claim-interaction 1 test and 96 assertions. The prior capped OOM results for the boundary and module-scope repository owners remain recorded and were not rerun.

Ownership correction: TASK-143.06.02 is Done and supplies runtime exact-thread semantic delivery with module and fake-port evidence. It does not own a rendered Fresh-to-Refused transition. TASK-143.01.14 composes semantic delivery into the production graph, TASK-143.03.10 composes the workbench, TASK-143.03.11 integrates it into the shell, and TASK-143.03.13 owns rendered browser behavior. TASK-143.03.13 must prove the real collapsed Fresh-to-Refused React and accessibility transition after that chain lands. This future evidence does not expand the accepted source scope of TASK-143.03.09. The task remains In Progress with all acceptance criteria unchecked.
<!-- SECTION:NOTES:END -->
