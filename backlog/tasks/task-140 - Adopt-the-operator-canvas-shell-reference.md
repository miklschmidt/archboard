---
id: TASK-140
title: Adopt the operator canvas shell reference
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 02:29'
updated_date: '2026-08-30 02:43'
labels: []
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
priority: high
type: feature
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the neutral and brass visual direction from TASK-111 with the approved operator canvas shell reference. People working with an agent should see more of the board while board identity, pane state, persistence, selection, code binding, and agent activity remain easy to inspect. This parent tracks the visual migration and the product additions that the reference makes concrete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The shipped shell follows the approved operator canvas shell reference in both light and dark modes while preserving the board, pane, persistence, claim, notice, dialog, and responsive behavior delivered by TASK-111
- [ ] #2 The lowercase archboard wordmark, flat technical grid, compact shell regions, cobalt selection accent, and lime status accent form one coherent visual system
- [ ] #3 The compact board strip, integrated agent workbench, code-binding inspector, and connected-path focus are delivered through focused child tasks
- [ ] #4 Rendered browser verification covers light and dark desktop layouts, a 420 pixel viewport, one and two panes, and fullscreen presentation without hiding an existing reachable state
- [ ] #5 Mockup-only branch, telemetry, proposed-diff, prompt-input, and synthetic preview details do not enter the product without a separate product contract
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Hold source work until TASK-139 is Done and the parent identifies its approved commits; integrate that fullscreen contract onto the fixed initiative base without taking CI-remediation work from TASK-138.
2. Preserve the TASK-111 behavior matrix while replacing the neutral/brass shell with one flat operator token system, lowercase wordmark, denser header, cobalt selection, lime live status, accessible states, and a canvas-first one-pane, two-pane, fullscreen, and 420px composition.
3. Recompose the existing real board/variant navigator as a narrower operator strip, retaining focused-pane navigation, draft/scratch naming, busy, empty, loading, failure, and refresh behavior without generated previews.
4. Move focused-pane connection, claim, take-back, current doing, and recent doing data into a collapsible bottom workbench, retaining offline/reconnect and fullscreen boundaries and adding no agent-control or proposed-diff concepts.
5. Add a right inspector driven by the focused pane selection and a validated portable binding projection; reuse the existing board-and-element code-target activation, settings, and GitHub recovery paths, and keep derived machine-local targets out of persistence.
6. Add a pure canonical-arrow connected-component helper and browser-only focus state that includes bound labels, terminates on cycles, rejects broken endpoints, exits on selection/board/Escape/visible control, and never mutates or exports scene state.
7. Add the cheapest stable unit, system, repository-inventory, and serial-browser enforcement for the new contracts. Exercise light/dark desktop, exact 420px, one/two panes, fullscreen, conflict, notice, scratch, offline/reconnect, claim/take-back, selection/code-target, and focus states in the rendered application.
8. Run formatting, lint, both TypeScript projects, focused owners, repository checks, frontend production build, and the complete sequential bun run check lane. Obtain an independent Standards and Spec review of b7be9322fc5a04b1d6cda9ce8d5635e4af9cbf9d..HEAD, remediate and rereview to clean, then finalize children in dependency order and TASK-140 through the Backlog CLI.
9. Reconcile only the parent-approved latest main after TASK-138 and exact-main CI allow it, rerun proportionate integration checks, and stop on a clean merge-ready branch without merging or pushing.
<!-- SECTION:PLAN:END -->
