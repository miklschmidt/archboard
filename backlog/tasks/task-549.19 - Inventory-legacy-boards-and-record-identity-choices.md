---
id: TASK-549.19
title: Inventory legacy boards and record identity choices
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-26T09:10:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 949000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 19.

## What to build

Overlapping legacy boards contain identity choices that migration cannot safely infer.

An owner requests a read-only inventory of legacy boards, states, reconciliation bases, views, walkthroughs, aliases, and document references.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

None. This ticket can start immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner requests a read-only inventory of legacy boards, states, reconciliation bases, views, walkthroughs, aliases, and document references.
- [ ] #2 The inventory records a source fingerprint and an explicit mapping plan. Matching names, bindings, or drill-down links provide evidence, never automatic identity merges.
- [ ] #3 Report conflicts in definitions, parents, order, relationship ownership, and policy. Record deliberate canonical choices while preserving original identity namespaces and aliases.
- [ ] #4 This workflow changes no active architecture and needs no completed target writer.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the integration ancestor and read migration and identity contracts.
2. Create TASK-549.19 proposals for Board persistence, Command interface, and Archboard server routes before architecture changes.
3. Use red/green tests through the shared public runtime with real temporary files and Git. Inventory exact legacy inputs and record explicit identity choices without active writes.
4. Add thin CLI/server transport, consumer guidance, domain/ADR updates, example, and evaluation coverage.
5. Simplify, prove criteria with focused tests and applicable gates, adopt proposals, release claims, merge integration, and commit signed work.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integration ancestor f1b91c9a9 confirmed. Proposals created before implementation: Board persistence@TASK-549.19, Command interface@TASK-549.19, Archboard server routes@TASK-549.19. Tests use the approved public runtime seam with real files and disposable Git.

Implemented public readLegacyInventory and saveLegacyMappingPlan through shared schema-derived contracts. Red failures precede inventory, evidence, saved choices, conflict categories, and duplicate-namespace behavior. Six focused migration cases pass with real files and Git. Current-only conflict analysis preserves separate historical coverage. Thin CLI model inventory/model plan and GET/PUT architecture migration routes are implemented. lint, both TypeScript projects, and 27 focused runtime/CLI contract cases pass. No frontend changes or target writer.

Acceptance evidence: inventory preserves complete original source and normalized supported documents, including lifecycle records, reconciliation bases, views, walkthroughs, former addresses and document references. Exact source paths/bytes include policy and exclude the separate plan. Six public runtime cases prove provenance, evidence without identity merges, all five conflict categories, persistent explicit choices, stale refusal, invalid mappings, and unchanged legacy files. One real CLI/server process case proves vault transport and structured stale refusals; its red failure reproduces the required-body-vault bug before the fix.
Consumer guidance, worked example, ADR 0058, domain terms and S20 evaluation coverage are updated. No model evaluation ran. Proposals Board persistence@TASK-549.19, Command interface@TASK-549.19 and Archboard server routes@TASK-549.19 were compared, checked, adopted at versions 108/149/109 and released. Touched boards have zero semantics/code warnings. The all-vault code pass still warns on unrelated Archboard, Archboard server and Live panes boards.
Simplification: reused the in-memory legacy decoder, existing vocabulary references, ID/schema authorities, lease and atomic writer. Removed redundant mapping validation. The plan has no active-model writer, journal, history conversion or cutover; explicit replacement values record intent for later composition validation. External referenced documents/source bytes are not retained by inventory.
<!-- SECTION:NOTES:END -->
