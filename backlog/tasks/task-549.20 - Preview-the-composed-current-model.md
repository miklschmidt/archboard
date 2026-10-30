---
id: TASK-549.20
title: Preview the composed current model
status: Done
assignee:
  - '@codex'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T04:59:00Z'
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
- [x] #1 An owner previews canonical modules, relationships, and flows from the mapping plan. CLI and browser readers expose the candidate without replacing legacy files.
- [x] #2 Preserve current semantic fields, groups, order, evidence, bindings, documents, and references. Remove level classification without inventing numeric depth.
- [x] #3 Ambiguous mappings and incoherent candidates block progress. Planned-only boards remain outside current architecture and retain explicit proposal mappings for the next slice.
- [x] #4 The preview retains its source fingerprint. Legacy files remain the sole live authority.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compose explicit saved migration choices through the existing public reader and canonical validation.
2. Expose preview reads through CLI and HTTP without installing architecture or changing legacy authority.
3. Reuse browser navigation, flow modes, source opening, and explicit pane addresses. Show exact source coverage and planned-only states.
4. Preserve source bytes during browser startup and background inspection. Keep exact readings across repository changes and deliberate browser history.
5. Exercise public file/Git and browser contracts, update consumer guidance, preserve prior architecture history, and adopt the six completed descriptions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend public preview uses the existing architecture reader with preview=<origin>, model read --preview, and the existing model HTTP route. Early contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.20-contract.md. Six public runtime cases cover semantic preservation, explicit mappings and choices, recursive flows, reference mapping, policy, and refusals. The CLI/HTTP process owner proves identical results and stale refusal. Architecture proposals remain draft. Parent owns all browser work and acceptance.

Backend evidence: 44 focused tests across nine files; 15 skill distribution and policy tests across three files; one real CLI/HTTP process case. Both TypeScript projects, full lint with zero warnings, formatting, and evaluation input checks pass. Draft architecture code checks have zero warnings on Board persistence, Command interface, and Archboard server routes. Nine inherited warnings remain on Archboard and Archboard server. The board export-width debt remains owned by TASK-549.24. No full-gate success is claimed. Simplification keeps composition behind existing canonical decoding and projections, reuses mapped identities, and shares order and conflict handling. No public operation export is added. Consumer guidance, ADR 0060, CONTEXT, examples, evaluation coverage, and test ownership descriptions match the backend. Reusable parent fixture: /home/msc/.local/state/archboard-implementation/task-549/task-549.20-fixture. Task and proposals remain In Progress and draft for parent browser acceptance.

Parent preview checkpoint: explicit preview pane addresses reuse recursive navigation and flow rendering. Source and mapping fingerprints remain visible. The real browser owner passes 1 case with 11 assertions, including reload, stale refusal, recovery, and unchanged exact legacy bytes. It exposed automatic schema upgrades in listings, background board snapshots, and vault diagnostics. Those inspection paths now normalize in memory, and canonical socket startup opens no legacy board. Types and lint passed before the final one-line diagnostics fix. Code opening, planned-only visible acceptance, final regression checks, proposal adoption, and task closure remain pending.

Parent browser acceptance is complete. Four preview cases pass with 20 assertions, covering modules, flows, fingerprints, unchanged old-schema source bytes, stale recovery, source opening, missing plans, planned-only empty states, and repeated legacy navigation. Related browser owners pass: workspace address with 4 cases and 14 assertions, canonical code with 1 case and 3 assertions, canonical references with 1 case and 14 assertions. Focused runtime regressions pass with 62 tests and 154 assertions. Final source/browser types, warning-free lint, formatting, and evaluation inputs pass. Browser screenshots and the architecture diagram were inspected outside Git. Exact evidence is in task-549.20-complete.md in the durable orchestration directory.

Simplification keeps one model query contract and existing rendering, routing, code-opening, and source validation owners. A reader instance belongs to its resolved vault, which prevents the reading picker from substituting Current when a foreign catalogue changes. No keyboard behavior or validation rule was disabled. Existing browser snapshots and diagnostics normalize old schemas in memory through the shared reader. All six affected architecture scopes have zero code warnings. Eight unrelated warnings remain on Archboard. The inherited board export width remains owned by TASK-549.24; no complete-gate success is claimed.

Adopted Board persistence@TASK-549.20-integration (DzM8gVAf), Command interface@TASK-549.20-integration (oCnalcKB), Archboard server routes@TASK-549.20-integration (AHxk2dsF), Browser application@TASK-549.20 (UNCNBRh9), Archboard server@TASK-549.20 (KTfzFVnN), and Live panes@TASK-549.20 (rjx0hffN). Three original backend drafts are shelved as restatement provenance. All original variant contents, parents, decisions, and views remain exact against the preparation merge.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Owners can inspect a canonical migration candidate through CLI, HTTP, and the browser while legacy files remain authoritative. The preview preserves semantic content, exact input fingerprints, and planned-state mappings. It refuses ambiguous or stale plans and supports navigation and source opening without implicit schema writes. Public runtime and browser evidence passes. Six architecture descriptions and consumer guidance match the implementation. Eight unrelated architecture warnings and the inherited export-width debt remain outside this slice.
<!-- SECTION:FINAL_SUMMARY:END -->
