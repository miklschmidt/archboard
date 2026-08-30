---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:57'
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
1. Replace the partial namespace resets with one @theme-wide reset, then redeclare only exact TASK-140 semantic aliases. Preserve the documented compiler boundary: transition and duration-150 are hardcoded candidates, not Archboard tokens or adopted product classes.
2. Restore the completed cobalt accent and white accent foreground roles. Keep pale selection treatment under primary-subtle and surface-hover only.
3. Build one independent contract fixture covering every source token, dark override, reduced-motion override, semantic alias, exact import prefix, high-contrast opt-out absence, and all 419 Tailwind 4.3.3 variables across 22 exhaustive groups.
4. Compile positive candidates for every owned family and refusal candidates for every configurable stock family. Add table-driven negative mutations for imports, Preflight, token-family values, aliases, forced-color opt-out, and reduced-motion loss, plus explicit evidence that the two hardcoded compiler candidates are absent from theme product source.
5. Run focused compile/mutation tests, complete module and repository lanes, both TypeScript projects, lint, formatting, frontend build, and final range/status audits. Record evidence without finalizing TASK-144.03 or claiming rendered equivalence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the application-wide semantic Tailwind theme and static compile fixtures; Vite configuration and rendered-shell equivalence remain protected.

Implemented the canonical src/ui/theme/app.css entrypoint and a module-owned Tailwind compiler fixture. The entrypoint imports Tailwind theme, Tailwind utilities, and the existing shell stylesheet in that order; omits Preflight; clears Tailwind visual defaults; preserves exact TASK-140 light/dark typography, color/state, compact geometry, flat elevation, and motion values behind namespaced source variables; and exposes semantic @theme inline utilities. Focused compiler proof passes 4 tests and 93 assertions for exact values, emitted utilities, refused unknown/default tokens, no Preflight output, forced-color preservation, and reduced motion.

Validation at implementation commit 7b5e1ff: bun test src/ui/theme/tests/theme-compile.test.ts passed 4 tests/93 assertions; bun run test:modules passed the complete isolated module lane; bun run test:repository passed 130 tests/415 assertions including inventory, boundaries, module scope, typography, and policy owners; bun run fmt:check, bun run lint, root and frontend TypeScript projects, and bun run build:frontend passed. The build retained its existing large-chunk advisory and expected unresolved /assets/excalidraw.css notice. TASK-144.02/.13 have not yet connected or imported app.css at this fixed base, so this leaf claims compiler proof, not rendered equivalence.

Rereview blocker audit at e687276: Tailwind 4.3.3 theme.css contains 419 variables across 22 fully classified groups, including 288 colors plus every font/type/leading/tracking, spacing, radius, shadow/inset/drop/text-shadow, motion, blur, perspective, aspect, breakpoint, container, and prose-width default. A minimal stylesheet importing only Tailwind theme and utilities and then applying @theme { --*: initial; } removes the reviewed theme-backed defaults, including leading-tight, inset-shadow-sm, drop-shadow-xl, text-shadow-lg, blur-xl, perspective-dramatic, and aspect-video. The same real compiler still emits transition with a hardcoded ease/0s fallback and duration-150 with a hardcoded 150ms value. No @theme namespace or default remains to clear. Disabling those built-in candidates requires a class-source policy or a narrowed contract, both outside the authorized theme-only mechanism. Per the remediation stopping condition, no partial CSS/test changes were made and TASK-144.03 remains In Progress pending parent direction. Accent and exhaustive fixture findings remain accepted and queued behind that decision.

Parent decision after blocker audit: option A accepted as the smallest product. TASK-144.03 clears every configurable Tailwind visual token and documents the two irreducible compiler-built candidates without creating a global class allowlist. No current Archboard consumer misuse exists; a future observed misuse may justify a separately owned enforcement change.

Option A remediation implemented in src/ui/theme only. app.css now clears the complete configurable Tailwind theme with --*: initial and redeclares only the TASK-140 semantic aliases; the accent role resolves to cobalt primary with its white foreground, while pale treatments remain explicitly named primary-subtle and surface-hover. The spacing alias is named grid-tight so Tailwind's stock leading-tight fallback remains unreachable.

The independent contract fixture pins the exact import prefix, all light tokens, every dark override, reduced-motion overrides, high-contrast opt-out absence, every semantic alias, all owned candidates, and all 419 Tailwind 4.3.3 variables in 22 exhaustive, non-overlapping groups. Real-compiler tests emit every owned family, refuse one representative for every configurable stock family, exercise import/Preflight/token/accessibility mutations, and document the irreducible compiler boundary: transition still emits its built-in ease/0s fallback and duration-150 still emits built-in 150ms, but neither is an Archboard alias or product-source class.

Validation after remediation: bun test src/ui/theme/tests/theme-compile.test.ts passed 21 tests/571 assertions; bun run test:modules passed 1,034 tests/7,617 assertions; bun run test:repository passed 130 tests/415 assertions; bun run fmt:check, bun run lint, root and frontend TypeScript projects, and bun run build:frontend passed. The build retained the expected unresolved /assets/excalidraw.css notice and existing large-chunk advisory. The first module-lane attempt overlapped another repository-wide validation process and hit unrelated fixed five-second timeouts in Codex protocol and code-target fixtures; a clean sequential rerun passed the full lane. This leaf still claims compiler and policy proof only, not rendered equivalence, and TASK-144.03 remains In Progress for parent review.
<!-- SECTION:NOTES:END -->
