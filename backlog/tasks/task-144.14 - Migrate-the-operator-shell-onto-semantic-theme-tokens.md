---
id: TASK-144.14
title: Integrate semantic tokens into the operator shell stylesheet
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:38'
updated_date: '2026-08-31 03:34'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.09
  - TASK-144.13
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/shell.css
  - tests/system/repository-policy/brand-typography.test.ts
  - tests/system/browser/shell-layout.test.ts
  - tests/system/browser/support/shell-render-matrix.ts
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
Reserved immediately after TASK-144.13 finalized and released this dependency-ready CSS-only UI leaf at integration HEAD 17e8fd7. It owns shell.css plus narrowly necessary token-equivalence proof and remains path-disjoint from the active broad-gate lane.

Implementation range from fixed base 2c22eac1c3ecb13b322f0965d8a19931f7ffb7b9 through 6cf1494534a346836050c042dd3433cd89acde74 maps exact equivalent shell values to canonical semantic color, typography, true rule/region/panel/control roles, touch/header size, flat elevation, disabled/status state, and motion variables. Reviewer remediation restored authored literals where values only coincided numerically with a different role: 4px control corners, 12px/18px human-copy leading, layout/list/panel spacing, and the 2px focused-tab stroke. Shell.tsx remains byte-identical.

The existing shell-layout browser owner now contains a deterministic 12-cell matrix extracted into named support: CSS viewports 1440x900 at DPR 1 and a scaled Flip proxy of 1920x1080 at DPR 2, each light/dark and normal/reduced-motion/forced-colors. The DPR-2 screenshots are 3840x2160 physical pixels; this is explicitly a scaled proxy, not a native 3840x2160 CSS viewport or a manual Samsung Flip probe. CDP media emulation runs inside the same canonical browser owner. It proves query activation, reduced computed 0.001ms durations and iteration count 1, forced-color-adjust auto with an unclipped >=2px focus outline, no page overflow, stable state/geometry, and visible shell touch targets >=43.5px.

Disposable evidence is under /tmp/archboard-task-144-14-shell-matrix. Before remediation uses reviewed CSS revision dca2b58a2dfd; after uses 6cf1494534a3. Each directory contains metrics.json and 12 matching screenshots. Comparison reported 12/12 normalized-hash matches, 12/12 state-hash matches, and 12/12 geometry-hash matches. Screenshot SHA-256 values are recorded per capture but are not asserted byte-identical. Visual inspection covered desktop-light-normal and flip-scaled-dark-forced-colors.

Focused verification passed: bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/shell-layout.test.ts (1 owner, 241 assertions); bun test tests/system/repository-policy/brand-typography.test.ts (4 tests, 52 assertions); targeted oxlint for the changed CSS/test/support files; git diff --check; and the browser owner frontend prerequisite build. The repository policy parses the complete light/default and dark legacy alias bridges, pins curated exact role mappings including compound type size/line pairs, and rejects hostile color, typography, radius, spacing, state, and motion swaps. Broad type, module, system, repository, complete browser, and check gates were not run here per parent ownership. Task intentionally remains In Progress with all acceptance criteria unchecked for independent review and capped broad gates.
<!-- SECTION:NOTES:END -->
