---
id: TASK-144.14
title: Integrate semantic tokens into the operator shell stylesheet
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:38'
updated_date: '2026-08-31 02:44'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.09
  - TASK-144.13
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/shell.css
parent_task_id: TASK-144
priority: high
type: task
ordinal: 236000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Map existing shell CSS declarations to the canonical semantic token variables without rewriting Shell.tsx markup, utility-classifying the shell, or redesigning it. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing shell selectors/layout/markup remain; color, typography, radius, spacing, elevation, state, and motion values consume canonical semantic variables where equivalent.
- [ ] #2 No Shell.tsx class migration, stylesheet rewrite, Tailwind utility conversion, layout change, or default shadcn aesthetic is introduced; Excalidraw reset/CSS remains isolated.
- [ ] #3 Rendered equivalence at desktop and Flip viewports covers light/dark/high-contrast/reduced-motion and detects token, overflow, focus, and touch regressions.
- [ ] #4 The integration follows the prior aesthetic guide and operator-shell reference; a markup/class migration requires separately split component tasks.
- [ ] #5 The existing shell-layout browser owner is run at desktop and Flip viewports before and after the CSS-only change and proves light, dark, high-contrast, reduced-motion, focus, overflow, and touch equivalence.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the aesthetic guide, operator-shell reference, semantic token owner, current shell stylesheet/markup, timing policy, and shell-layout browser owner. Capture the unchanged baseline at desktop and Flip viewports for light, dark, high-contrast, reduced-motion, focus, overflow, and touch behavior. 2. Replace only equivalent literal color, typography, radius, spacing, elevation, state, and motion values in shell.css with canonical semantic variables; preserve selectors, declaration behavior, ordering, markup, layout, Excalidraw isolation, and reachable states. 3. Add the smallest stable token-usage policy proof needed to prevent literal regression without snapshotting the stylesheet or converting to utilities. 4. Rebuild and rerun the same focused rendered matrix, compare observable geometry/state behavior, run focused theme/shell/type/lint/format/diff checks, and submit an immutable range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.13 finalized and released this dependency-ready CSS-only UI leaf at integration HEAD 17e8fd7. It owns shell.css plus narrowly necessary token-equivalence proof and is path-disjoint from all active implementation lanes.
<!-- SECTION:NOTES:END -->
