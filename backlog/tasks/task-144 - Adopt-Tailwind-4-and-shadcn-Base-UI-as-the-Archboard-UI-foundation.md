---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: Done
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-09-03 22:06'
labels: []
dependencies:
  - TASK-140
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/agents/boundaries.md
  - docs/design/codex-workbench-delivery-map.md
priority: high
type: enhancement
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Keep the completed Tailwind 4 and shadcn/Base UI foundation, then let TASK-143.08 remove test machinery that only re-tests tool resolution, fixture cleanup, or copied configuration. The resulting product has one canonical application stylesheet and semantic theme, one alias contract, reviewed Base UI source modules, and direct build and rendered opener evidence. Completed leaf records remain historical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One canonical Tailwind stylesheet and semantic theme, exact resolver agreement, immutable reviewed shadcn Base UI inputs, separate button and dialog modules, one opener consumer, and mandatory aesthetic guidance remain in production after recovery.
- [x] #2 Oxfmt uses native Tailwind v4 sorting and actual helper names, strict native Oxlint remains deny-warnings clean, and no custom Tailwind lint, second formatter, copied defaults, warning allowance, or speculative cva is introduced.
- [x] #3 Preflight stays off, Excalidraw CSS stays separate, TASK-140 tokens flow through semantic variables, pinned source provenance remains reviewable, and default aesthetics, icons, and unneeded dependencies stay removed.
- [x] #4 Frozen install, ordinary TypeScript and lint resolution, normal format check, a real Vite production build, the style-entry owner, opener browser workflow, rendered shell equivalence, and repository boundaries prove the result without dedicated tool-cleanup process suites.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the reviewed UI foundation through TASK-144.01 through TASK-144.06: pin the Tailwind 4, shadcn, Base UI, clsx, and tailwind-merge inputs; register the Tailwind Vite plugin and canonical @ alias; expose TASK-140 tokens as the semantic theme; record immutable shadcn inputs; provide the sole cn helper; and use native Oxfmt Tailwind sorting.

2. Put the foundation into production through TASK-144.08, TASK-144.11, TASK-144.13, TASK-144.14, TASK-144.19, and TASK-144.20: copy reduced reviewed Button and Dialog modules, migrate the opener to their controlled API, load one canonical application stylesheet with separate Excalidraw CSS, and map the operator shell to semantic roles while retaining rendered desktop and Flip evidence.

3. Make the boundary durable through TASK-144.09, TASK-144.12, TASK-144.15 through TASK-144.18: document and require the aesthetic authority; keep Vite, frontend TypeScript, root TypeScript, and Oxlint on the same UI alias; and enforce that agreement through the existing repository policy.

4. Verify the recovered integration without retaining superseded tool-cleanup suites. Use the completed frozen-install, type, lint, format, Vite build, style-entry, repository-policy, opener-browser, and rendered-shell evidence from the child records. Confirm TASK-140 supplies the operator-shell baseline and TASK-143.08.05 confirms the recovered integration, then finalize only if the fixed canonical state and child evidence still satisfy all parent criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Finalization audit at fixed canonical HEAD ea09607c5fcc8e177f9e334428c4fe2e212ebcdb: all 19 direct children are Done, have checked acceptance criteria and final summaries, and have no descendants. TASK-140 and TASK-143.08.05 are Done.

AC1: TASK-144.01-.05, .08-.09, .11-.14, and .19-.20 establish the pinned inputs, one stylesheet/theme, resolver agreement, reduced modules, opener consumer, and aesthetic authority.
AC2: TASK-144.05-.06, .10, and .18 provide the sole helper, native Oxfmt sorting, strict alias-aware Oxlint, and no added formatter, custom Tailwind rule, warning allowance, or cva.
AC3: TASK-144.01, .03-.04, .09, .13-.14, and .19-.20 retain provenance, semantic TASK-140 roles, separate Excalidraw CSS, disabled Preflight, and reduced visual/dependency scope.
AC4: TASK-144.01, .10-.11, .13-.18, and .20 record frozen-install, type/lint/format/build, style-entry, rendered opener/shell, and repository-boundary evidence. TASK-143.08.07 removed the obsolete Vite/Tailwind/Oxfmt fixture cluster, and TASK-143.08.05 records the recovered integration evidence. No broad gate was rerun because those completed records are the canonical evidence and this finalization changes Backlog metadata only.

Tracked worktree was clean before this metadata update and git diff --check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Finalized the recovered Tailwind 4 and shadcn/Base UI foundation roll-up. The completed child records prove the canonical semantic stylesheet, aligned aliases and boundaries, reviewed reduced Base UI modules, native formatting and strict linting, and rendered opener/operator-shell workflows. TASK-143.08 recovery retains the product evidence while removing obsolete tool-cleanup fixtures.
<!-- SECTION:FINAL_SUMMARY:END -->
