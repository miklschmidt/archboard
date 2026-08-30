---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:33'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/theme
parent_task_id: TASK-144
priority: high
type: task
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose completed TASK-140 tokens as the canonical Tailwind semantic theme while preserving reset ownership. Delegation profile: gpt-5.6-sol, high because this is an application-wide visual contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 app.css places all @import rules first: Tailwind theme/utilities and then the existing shell stylesheet, before any declaration or @theme block; Tailwind preflight/base reset is not imported.
- [ ] #2 @theme maps the exact operator-shell color, typography, radius, spacing, elevation, state, and motion tokens without adding a second palette or replacing Excalidraw variables.
- [ ] #3 Static compile fixtures prove named utilities are emitted and unknown token names are absent; they do not claim rendered equivalence.
- [ ] #4 Theme changes preserve light/dark/high-contrast/reduced-motion contracts and defer rendered shell equivalence to TASK-144.14 browser coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish src/ui/theme/app.css as the single application stylesheet entrypoint, with Tailwind theme and utilities imports followed by the existing shell stylesheet and no Preflight import.
2. Define one namespaced source token set from the completed TASK-140 shell values for light and dark color/state roles, pinned typography, compact spacing and radii, flat elevation, and restrained motion; expose only semantic Tailwind namespaces through @theme inline and remove relevant framework defaults.
3. Add one module-owned static fixture that compiles app.css through Tailwind, supplies complete class candidates, and asserts emitted semantic utilities plus the absence of unknown and framework-palette utilities without treating source text or rendering as proof.
4. Run the focused compile owner, module and repository policy lanes, both TypeScript projects, lint, formatting, frontend build where the fixed base permits it, and a final scope/status audit; record evidence without completing TASK-144.03.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the application-wide semantic Tailwind theme and static compile fixtures; Vite configuration and rendered-shell equivalence remain protected.

Implemented the canonical src/ui/theme/app.css entrypoint and a module-owned Tailwind compiler fixture. The entrypoint imports Tailwind theme, Tailwind utilities, and the existing shell stylesheet in that order; omits Preflight; clears Tailwind visual defaults; preserves exact TASK-140 light/dark typography, color/state, compact geometry, flat elevation, and motion values behind namespaced source variables; and exposes semantic @theme inline utilities. Focused compiler proof passes 4 tests and 93 assertions for exact values, emitted utilities, refused unknown/default tokens, no Preflight output, forced-color preservation, and reduced motion.

Validation at implementation commit 7b5e1ff: bun test src/ui/theme/tests/theme-compile.test.ts passed 4 tests/93 assertions; bun run test:modules passed the complete isolated module lane; bun run test:repository passed 130 tests/415 assertions including inventory, boundaries, module scope, typography, and policy owners; bun run fmt:check, bun run lint, root and frontend TypeScript projects, and bun run build:frontend passed. The build retained its existing large-chunk advisory and expected unresolved /assets/excalidraw.css notice. TASK-144.02/.13 have not yet connected or imported app.css at this fixed base, so this leaf claims compiler proof, not rendered equivalence.
<!-- SECTION:NOTES:END -->
