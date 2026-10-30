---
id: TASK-549.21
title: Preserve legacy proposals and historical coverage
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T10:18:00Z'
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
- [x] #1 Extend the migration preview with drafts, baselines, standing conflicts, adoption, shelving, corrections, and lifecycle metadata.
- [x] #2 Readers can inspect retained original documents with their original coverage. No legacy reading borrows current surrounding modules or invents a complete historical repository model.
- [x] #3 Convert each draft through an explicit predecessor and baseline mapping. Matching task IDs or proposal names never combine independent proposals automatically.
- [x] #4 Planning-only boards become proposals. An immutable checkpoint retains complete originals, including unresolved data, before any later cutover.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration and main ancestry, then publish the early backend contract.
2. Create claimed TASK-549.21 draft proposals on Board persistence, Command interface, and Archboard server routes.
3. Extend the existing mapping plan and preview with explicit draft baselines, scoped legacy history, and lifecycle evidence through the public architecture seam.
4. Retain exact original inputs through the existing signed archive and retry owner without installing or changing legacy authority.
5. Run focused RED/GREEN owners, affected structural checks, and draft architecture checks. Update consumer guidance and simplify.
6. Merge latest integration, release claims, stop this worktree server, commit signed checkpoints, and publish backend handoff. Keep drafts and task In Progress for parent acceptance.

7. Parent composes the completed .14 source, then extends the existing preview reader with original-state selection, explicit historical coverage, lifecycle and standing details, and retained original inspection. Preserve paired preview state/checkpoint selectors through the existing router. Add Browser application@TASK-549.21 before frontend changes. Use isolated real files/Git through public operations for fixtures and the approved browser seam for visible selection, recovery, and retained-original behavior. Restate the three backend proposals onto current architecture, simplify, validate, adopt, and close only after all four criteria are proven.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend implementation adds scoped original history, explicit draft predecessor and exact baseline choices, canonical compact conversion evidence, original standing and lifecycle records, and lossless original retention through the existing signed archive. No live migration or second history store exists. Draft proposals remain Board persistence@TASK-549.21, Command interface@TASK-549.21, and Archboard server routes@TASK-549.21. Parent-owned browser acceptance, adoption, and task closure remain pending. The early contract and concrete signed fixture are under /home/msc/.local/state/archboard-implementation/task-549. A nullable retained plan revision needs a parent type adjustment at tests/system/browser/canonical-model-preview.test.ts:87. Full type-check reports only that caller error. Backend compilation with that browser fixture excluded passes with every compiler rule unchanged. Full lint and evaluation inputs pass. Runtime evidence includes 20 migration cases, the additional original evidence case, 17 canonical history and correction regression cases, two migration adapter cases, and one correction adapter case. Final logs and source provenance will be recorded in task-549.21-backend.md.

Accepted backend evidence covers 22 migration cases with 124 assertions across reused unchanged owners plus the final history and retention runs. Canonical history and correction regressions pass 17 cases/81 assertions. Canonical reference regressions pass 10 cases/40 assertions. Migration CLI/HTTP parity passes two cases/21 assertions, and correction parity passes one case/10 assertions. Full lint and formatting pass; the added retained-input test also passes its focused lint owner. Evaluation inputs pass 21 scenarios, 21 fixtures, and 14 coverage parts without a model call. Backend compilation passes with the one parent-owned nullable-plan browser assertion excluded and all compiler rules retained. Three draft architecture scopes have zero code warnings, semantics has zero diagnostics, and eight inherited warnings remain on Archboard. Exact original variants, designations, decisions, and views remain unchanged against 2c04f606e. The simplification pass groups immutable read evidence and removes an eight-argument helper. No frontend edit, browser test, review, adoption, push, PR, migration installation, or task closure occurred. The latest integration merge reports already up to date. Parent acceptance remains pending.

Signed preparation merge d2d0a549112bf2511e9c45661affa966cbda1fd6 includes integration5d2f45465332b84c59d19c3a7c21ee2b8abd8aae. The merger preserved every authored variant, parent, decision and view, kept incoming .14 currents, and retained all three .21 drafts. No frontend conflict occurred. Five focused public runtime owners pass18 tests99 assertions. Full types have only the documented nullable preview.planRevision browser assertion; the frontend compiler passes. Parent now owns the source and all UI work.

The first parent browser slice passes one case with four assertions. The existing preview header now selects independent original states. It preserves the paired migration checkpoint through selection, reload and Back, and shows only the original one-board coverage. Historical selections no longer display the empty-current message. The existing router keeps its ordinary canonical selector behavior. Public fixture setup uses real files, Git, inventory, mapping and retention. Types and lint pass. Browser application@TASK-549.21 is drafted before these changes. Lifecycle/standing details and retained-original inspection remain pending.

The second browser slice passes one case with ten assertions. A bounded original-state disclosure shows lifecycle reasons, correction source revisions, explicit predecessor and baseline choices, baseline fingerprints, distinct compact changes, competing original values, and blocked ancestry. Equal display names never combine independent drafts. Every distinct original record remains visible; exact duplicate evidence rows share one display key. Types and lint pass. The parent removed an empty summary element when original metadata supplies no summary. Retained-original inspection and degraded composition recovery remain pending.

Retained-original inspection now passes one browser case with five assertions. It shows the exact saved source after live files disappear and keeps unresolved originals inspectable when no complete candidate or mapping plan exists. The reader shows diagnostics instead of an empty current system. One selected file decodes on demand; unsupported UTF-8 retains its base64 representation. A native read-only text area supports keyboard scrolling and copying. Types and lint pass. Consumer guidance, frontend contracts, test ownership and evaluation coverage now include the three browser workflows. Final regression and visual acceptance, architecture restatement and adoption, and closure remain.

Final parent acceptance passes eight browser cases with46 assertions: three original-history cases, four existing preview cases, and one canonical proposal case. A later visual pass catches an initially enabled state picker before its history arrives. The picker now disables during initial loading, and the browser helper waits for actual readiness. All three history cases then pass19 assertions. Source and browser types, lint, formatting, evaluation inputs and git diff --check pass. The parent inspected the conflict and stable originals screenshots. Temporary capture calls are removed.
The completed UI keeps paired original state/checkpoint addresses, explicit one-board coverage, lifecycle and correction evidence, distinct draft baseline choices, conflicting values, blocked ancestry, exact original text and lossless unsupported bytes. Incoherent retained input shows Originals only and recovery, without a current diagram. The reader decodes one selected file, and a native read-only text area supports keyboard scrolling/copying with bounded height. Source provenance and original-file controls have distinct labels.
All four accepted architecture descriptions are adopted and warning-free. Persistence, command interface and server routes use TASK-549.21-integration; Browser application uses TASK-549.21. Their earlier backend drafts remain shelved with exact content and parents. All prior decisions and views remain exact. Eight unrelated Archboard warnings remain. The inherited interface-width work remains owned by TASK-549.24. Consumer guidance, frontend contracts, test ownership and evaluation coverage match the delivered behavior. The simplification pass keeps the existing query/router/report owners and separates readable coverage, original evidence and exact source inspection without adding another authority.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Migration previews now preserve independent original states, explicit draft ancestry and baselines, standing conflicts, lifecycle decisions and correction evidence. Retention preserves complete original inputs before cutover without changing legacy authority. The browser keeps exact state/checkpoint addresses and exposes one-board coverage and original files even when composition is unavailable.
Focused public runtime and adapter evidence, eight browser cases, types, lint, formatting, evaluation inputs and the four accepted architecture scopes pass. The existing eight unrelated Archboard warnings and interface-width transition remain outside this slice. TASK-549 remains In Progress.
<!-- SECTION:FINAL_SUMMARY:END -->
