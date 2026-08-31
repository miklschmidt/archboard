---
id: TASK-144.13
title: Import the canonical Archboard application stylesheet
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:38'
updated_date: '2026-08-31 02:40'
labels: []
dependencies:
  - TASK-144.02
  - TASK-144.03
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - frontend/main.tsx
  - frontend/index.html
  - tests/system/repository-policy/frontend-style-entry.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 235000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the frontend entry seam that imports `src/ui/theme/app.css` exactly once from `frontend/main.tsx` and removes the direct shell stylesheet link from `frontend/index.html`. Excalidraw vendor CSS remains a separate static asset.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frontend/main.tsx imports the canonical Archboard application stylesheet exactly once and frontend/index.html no longer links src/ui/shell/shell.css directly.
- [ ] #2 Excalidraw vendor CSS ordering remains explicit and a production build contains one Archboard application stylesheet without duplicate Tailwind output.
- [ ] #3 Focused build and rendered shell checks prove one/two-pane, fullscreen, and existing controls remain unchanged after the import-path move.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the aesthetic guide, Tailwind adoption research, current frontend entry/index ordering, canonical app.css, shell module, and focused rendered owners. 2. Move the canonical application stylesheet import to frontend/main.tsx exactly once and remove only the direct shell stylesheet link from frontend/index.html, preserving explicit Excalidraw vendor CSS ordering. 3. Add the smallest stable build assertion needed to prevent duplicate Archboard/Tailwind output without taking later visual-refactor scope. 4. Validate production build plus focused rendered one-pane, two-pane, fullscreen, and existing-control workflows; submit the immutable range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.02 finalized and released this dependency-ready UI seam at integration HEAD a6957cc. It owns the frontend entry/import path and is path-disjoint from every active lane; complete browser and broad gates remain root-owned.

Implementation commit `c01e061` imports `src/ui/theme/app.css` once from `frontend/main.tsx`, removes only the direct shell stylesheet link from `frontend/index.html`, and adds a focused repository-policy owner for the entry contract.

Validation:
- `bun run build:frontend` passed. The built page kept `/assets/excalidraw.css` explicit and emitted one 43.24 kB application CSS asset with one Tailwind theme layer and one utilities layer.
- `bun test tests/system/repository-policy/frontend-style-entry.test.ts src/ui/theme/tests/theme-compile.test.ts` passed: 23 tests, 576 assertions.
- Focused serial browser owners passed: `shell-layout.test.ts` covered light/dark themes, controls, one pane, two panes, touch targets, notices, and the workbench at 1440x900; `fullscreen-presentation.test.ts` covered entry, pane switching, refusal recovery, Escape, and exact session restoration.
- Focused Oxlint, Oxfmt, and frontend TypeScript checks passed.

The complete repository, system, module, and browser lanes remain for the parent integration gate. Per delegation, the task stays In Progress and its acceptance criteria remain unchecked.
<!-- SECTION:NOTES:END -->
