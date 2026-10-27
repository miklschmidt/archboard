---
id: TASK-549.21
title: Preserve legacy proposals and historical coverage
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T06:31:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.09
  - TASK-549.20
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 21.

## What to build

Independent legacy histories cannot truthfully become one historical repository state.

Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.09, TASK-549.20
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.
- [ ] #2 Readers can inspect retained original documents with their original coverage. No legacy reading borrows current surrounding modules or invents a complete historical repository model.
- [ ] #3 Convert each draft through an explicit predecessor and baseline mapping. Matching task IDs or proposal names never combine independent proposals automatically.
- [ ] #4 Planning-only boards become proposals. An immutable checkpoint retains complete originals, including unresolved data, before any later cutover.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration and main ancestry, then publish the early backend contract.
2. Create claimed TASK-549.21 draft proposals on Board persistence, Command interface, and Archboard server routes.
3. Extend the existing mapping plan and preview with explicit draft baselines, scoped legacy history, and lifecycle evidence through the public architecture seam.
4. Retain exact original inputs through the existing signed archive and retry owner without installing or changing legacy authority.
5. Run focused RED/GREEN owners, affected structural checks, and draft architecture checks. Update consumer guidance and simplify.
6. Merge latest integration, release claims, stop this worktree server, commit signed checkpoints, and publish backend handoff. Keep drafts and task In Progress for parent acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend implementation adds scoped original history, explicit draft predecessor and exact baseline choices, canonical compact conversion evidence, original standing and lifecycle records, and lossless original retention through the existing signed archive. No live migration or second history store exists. Draft proposals remain Board persistence@TASK-549.21, Command interface@TASK-549.21, and Archboard server routes@TASK-549.21. Parent-owned browser acceptance, adoption, and task closure remain pending. The early contract and concrete signed fixture are under /home/msc/.local/state/archboard-implementation/task-549. A nullable retained plan revision needs a parent type adjustment at tests/system/browser/canonical-model-preview.test.ts:87. Full type-check reports only that caller error. Backend compilation with that browser fixture excluded passes with every compiler rule unchanged. Full lint and evaluation inputs pass. Runtime evidence includes 20 migration cases, the additional original evidence case, 17 canonical history and correction regression cases, two migration adapter cases, and one correction adapter case. Final logs and source provenance will be recorded in task-549.21-backend.md.

Accepted backend evidence covers 22 migration cases with 127 assertions across reused unchanged owners plus the final history and retention runs. Canonical history and correction regressions pass 17 cases/81 assertions. Canonical reference regressions pass 10 cases/40 assertions. Migration CLI/HTTP parity passes two cases/21 assertions, and correction parity passes one case/10 assertions. Full lint and formatting pass; the added retained-input test also passes its focused lint owner. Evaluation inputs pass 21 scenarios, 21 fixtures, and 14 coverage parts without a model call. Backend compilation passes with the one parent-owned nullable-plan browser assertion excluded and all compiler rules retained. Three draft architecture scopes have zero code warnings, semantics has zero diagnostics, and eight inherited warnings remain on Archboard. Exact original variants, designations, decisions, and views remain unchanged against 2c04f606e. The simplification pass groups immutable read evidence and removes an eight-argument helper. No frontend edit, browser test, review, adoption, push, PR, migration installation, or task closure occurred. The latest integration merge reports already up to date. Parent acceptance remains pending.
<!-- SECTION:NOTES:END -->
