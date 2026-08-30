---
id: TASK-140
title: Adopt the operator canvas shell reference
status: To Do
assignee: []
created_date: '2026-08-30 02:29'
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
