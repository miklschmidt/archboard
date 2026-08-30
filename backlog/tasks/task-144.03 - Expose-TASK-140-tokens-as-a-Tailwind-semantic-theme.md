---
id: TASK-144.03
title: Expose TASK-140 tokens as a Tailwind semantic theme
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 23:42'
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
1. Audit all 419 variables shipped by Tailwind 4.3.3 theme.css and group every color, typography, spacing, radius, shadow/filter, motion, viewport, and default namespace against the TASK-140 vocabulary.
2. Prove whether @theme can refuse every unowned utility with a minimal compiler fixture that clears the entire imported theme through --*: initial; stop if Tailwind still emits a listed stock utility.
3. After parent ownership direction, either narrow acceptance to clearing every configurable visual token while documenting hardcoded generic utilities, or split a separately authorized source-class policy outside this theme leaf. Then fix the cobalt accent alias and add exact import, complete token-oracle, emitted/refused-family, and negative-mutation coverage.
4. If unblocked, run focused compiler and mutation owners, complete module and repository lanes, both TypeScript projects, lint, formatting, frontend build, and final scope/status audits without claiming rendered equivalence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the application-wide semantic Tailwind theme and static compile fixtures; Vite configuration and rendered-shell equivalence remain protected.

Implemented the canonical src/ui/theme/app.css entrypoint and a module-owned Tailwind compiler fixture. The entrypoint imports Tailwind theme, Tailwind utilities, and the existing shell stylesheet in that order; omits Preflight; clears Tailwind visual defaults; preserves exact TASK-140 light/dark typography, color/state, compact geometry, flat elevation, and motion values behind namespaced source variables; and exposes semantic @theme inline utilities. Focused compiler proof passes 4 tests and 93 assertions for exact values, emitted utilities, refused unknown/default tokens, no Preflight output, forced-color preservation, and reduced motion.

Validation at implementation commit 7b5e1ff: bun test src/ui/theme/tests/theme-compile.test.ts passed 4 tests/93 assertions; bun run test:modules passed the complete isolated module lane; bun run test:repository passed 130 tests/415 assertions including inventory, boundaries, module scope, typography, and policy owners; bun run fmt:check, bun run lint, root and frontend TypeScript projects, and bun run build:frontend passed. The build retained its existing large-chunk advisory and expected unresolved /assets/excalidraw.css notice. TASK-144.02/.13 have not yet connected or imported app.css at this fixed base, so this leaf claims compiler proof, not rendered equivalence.

Rereview blocker audit at e687276: Tailwind 4.3.3 theme.css contains 419 variables across 22 fully classified groups, including 288 colors plus every font/type/leading/tracking, spacing, radius, shadow/inset/drop/text-shadow, motion, blur, perspective, aspect, breakpoint, container, and prose-width default. A minimal stylesheet importing only Tailwind theme and utilities and then applying @theme { --*: initial; } removes the reviewed theme-backed defaults, including leading-tight, inset-shadow-sm, drop-shadow-xl, text-shadow-lg, blur-xl, perspective-dramatic, and aspect-video. The same real compiler still emits transition with a hardcoded ease/0s fallback and duration-150 with a hardcoded 150ms value. No @theme namespace or default remains to clear. Disabling those built-in candidates requires a class-source policy or a narrowed contract, both outside the authorized theme-only mechanism. Per the remediation stopping condition, no partial CSS/test changes were made and TASK-144.03 remains In Progress pending parent direction. Accent and exhaustive fixture findings remain accepted and queued behind that decision.
<!-- SECTION:NOTES:END -->
