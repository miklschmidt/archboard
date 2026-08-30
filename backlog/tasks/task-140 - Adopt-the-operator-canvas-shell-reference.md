---
id: TASK-140
title: Adopt the operator canvas shell reference
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 02:29'
updated_date: '2026-08-30 10:01'
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
- [ ] #1 The shipped shell follows the approved operator canvas shell reference in both light and dark modes while preserving the board, pane, persistence, claim, notice, dialog, and supported desktop behavior delivered by TASK-111
- [ ] #2 The lowercase archboard wordmark, flat technical grid, compact shell regions, cobalt selection accent, and lime status accent form one coherent visual system
- [ ] #3 The compact board strip, integrated agent workbench, code-binding inspector, connected-path focus, and real lazy board preview are delivered through focused child tasks
- [ ] #4 Rendered browser verification covers light and dark supported desktop layouts, one and two panes, fullscreen presentation, pointer and keyboard operation, and Samsung Flip desktop touch targets without hiding an existing reachable state
- [ ] #5 Mockup-only branch, telemetry, proposed-diff, prompt-input, and illustrative or synthetic preview details do not enter the product; TASK-140.06 is the separate contract for previews of real current board content
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the finalized TASK-139 fullscreen contract on the exact green a8275ac base while keeping CI remediation and main reconciliation parent-owned.
2. Preserve the TASK-111 desktop behavior matrix while replacing the neutral/brass shell with one flat operator token system, lowercase wordmark, denser header, cobalt selection, lime live status, accessible states, and a canvas-first one-pane, two-pane, and fullscreen composition.
3. Keep the completed TASK-140.02 compact navigator history intact, then use TASK-140.06 to refine its board/variant items and add lazy previews of real current board content through a bounded read-only browser path.
4. Keep focused-pane connection, claim, take-back, current doing, and recent doing data in the collapsible bottom workbench, retaining offline/reconnect and fullscreen boundaries and adding no agent-control or proposed-diff concepts.
5. Keep the right inspector driven by focused-pane selection and a validated portable binding projection; reuse board-and-element code-target activation, settings, and GitHub recovery, and keep derived machine-local targets out of persistence.
6. Keep deterministic canonical-arrow connected-path focus browser-only, including bound labels, cycle termination, broken-endpoint rejection, selection/board/Escape/visible exits, and zero scene or export mutation.
7. Serialize cropped desktop-only regional parity passes for navigator, top shell, workbench, and inspector/focus. Replace only obsolete phone assertions with supported desktop coverage while preserving panes, fullscreen, notices, conflict, scratch, offline/reconnect, claim/take-back, selection/code-target, focus, accessibility, and Samsung Flip desktop touch behavior.
8. Run formatting, lint, both TypeScript projects, focused owners, repository checks, frontend production build, and the complete sequential bun run check lane. Obtain an independent Standards and Spec review of a8275ac230dbba315aa5768335f80fc5dcdf91ca..HEAD, remediate and rereview to clean, then finalize TASK-140.06 and TASK-140 through the Backlog CLI.
9. Stop on a clean merge-ready branch without merging main or pushing; final reconciliation remains parent-owned.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Product scope update (2026-08-30): the user established that Archboard's shell is desktop-only. Active TASK-140 acceptance and planning no longer gate phone, 420px, or narrow reflow. Completed TASK-140.01-.04 history remains unchanged. Desktop pointer, keyboard, and Samsung Flip desktop-sized touch workflows remain required. The user separately approved TASK-140.06 for previews of real current board content, which supersedes only the earlier synthetic/generated-thumbnail non-goal.
<!-- SECTION:NOTES:END -->
