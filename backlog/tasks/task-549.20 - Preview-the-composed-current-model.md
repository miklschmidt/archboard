---
id: TASK-549.20
title: Preview the composed current model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T04:12:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
  - TASK-549.15
  - TASK-549.19
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 950000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 20.

## What to build

Owners need to inspect the composed current architecture before replacing legacy authority.

An owner previews canonical modules, relationships, and flows from the mapping plan. CLI and browser readers expose the candidate without replacing legacy files.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05, TASK-549.15, TASK-549.19
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner previews canonical modules, relationships, and flows from the mapping plan. CLI and browser readers expose the candidate without replacing legacy files.
- [ ] #2 Preserve current semantic fields, groups, order, evidence, bindings, documents, and references. Remove level classification without inventing numeric depth.
- [ ] #3 Ambiguous mappings and incoherent candidates block progress. Planned-only boards remain outside current architecture and retain explicit proposal mappings for the next slice.
- [ ] #4 The preview retains its source fingerprint. Legacy files remain the sole live authority.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Publish the shared preview contract and parent fixture recipe.
2. Keep Board persistence@TASK-549.20, Command interface@TASK-549.20, and Archboard server routes@TASK-549.20 as draft architecture proposals.
3. Use public architecture reads and writes with real files and Git in small red-green loops. Compose explicit identity and conflict choices through existing canonical validation.
4. Expose the candidate through model read --preview and the existing model HTTP route. Update consumer guidance.
5. Run affected checks, simplify, merge the latest integration, release claims, stop the server, and publish the backend handoff. Parent owns browser acceptance and closure.

6. Add Browser application@TASK-549.20. Expose an explicit preview pane address with source and mapping provenance. Reuse recursive modules, flow modes, selection, and code/reference navigation. Keep legacy authority and refuse stale or unresolved previews.

7. Use the existing browser seam with real legacy files, a saved mapping plan, and a temporary Git repository. Cover navigation and reload, source fingerprints, planned-only coverage, stale refusal, and recovery. Run affected checks, simplify, adopt completed proposals, and merge through the merger agent.

8. The browser test exposed implicit schema upgrades during navigator listing and legacy pane startup. Make inventory reads non-persisting and let canonical panes start without a legacy board. Record Live panes@TASK-549.20 and Archboard server@TASK-549.20, including preview code activation through the existing opener.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend public preview uses the existing architecture reader with preview=<origin>, model read --preview, and the existing model HTTP route. Early contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.20-contract.md. Six public runtime cases cover semantic preservation, explicit mappings and choices, recursive flows, reference mapping, policy, and refusals. The CLI/HTTP process owner proves identical results and stale refusal. Architecture proposals remain draft. Parent owns all browser work and acceptance.

Backend evidence: 44 focused tests across nine files; 15 skill distribution and policy tests across three files; one real CLI/HTTP process case. Both TypeScript projects, full lint with zero warnings, formatting, and evaluation input checks pass. Draft architecture code checks have zero warnings on Board persistence, Command interface, and Archboard server routes. Nine inherited warnings remain on Archboard and Archboard server. The board export-width debt remains owned by TASK-549.24. No full-gate success is claimed. Simplification keeps composition behind existing canonical decoding and projections, reuses mapped identities, and shares order and conflict handling. No public operation export is added. Consumer guidance, ADR 0060, CONTEXT, examples, evaluation coverage, and test ownership descriptions match the backend. Reusable parent fixture: /home/msc/.local/state/archboard-implementation/task-549/task-549.20-fixture. Task and proposals remain In Progress and draft for parent browser acceptance.

Parent preview checkpoint: explicit preview pane addresses reuse recursive navigation and flow rendering. Source and mapping fingerprints remain visible. The real browser owner passes 1 case with 11 assertions, including reload, stale refusal, recovery, and unchanged exact legacy bytes. It exposed automatic schema upgrades in listings, background board snapshots, and vault diagnostics. Those inspection paths now normalize in memory, and canonical socket startup opens no legacy board. Types and lint passed before the final one-line diagnostics fix. Code opening, planned-only visible acceptance, final regression checks, proposal adoption, and task closure remain pending.
<!-- SECTION:NOTES:END -->
