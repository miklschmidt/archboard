---
id: TASK-549.15
title: Follow code bindings and cross-model references
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T19:54:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.04
  - TASK-549.10
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 945000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 15.

## What to build

Architecture ownership must remain separate from code location and navigation into another model.

Readers open code and follow explicit references into another model without changing architectural ownership. Existing checkout selection still resolves code bindings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.04, TASK-549.10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Readers open code and follow explicit references into another model without changing architectural ownership. Existing checkout selection still resolves code bindings.
- [ ] #2 A cross-model reference names its model, subject, and state. Historical readings pin foreign revisions and never substitute current content.
- [ ] #3 CLI and browser readers expose unavailable models or source evidence. No operation silently transfers ownership or writes across two models.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the stable backend contract and draft proposals on Board persistence, Archboard server routes, and Command interface.
2. Use short TDD slices at the approved public architecture read/write boundary with real temporary files and Git. Add explicit foreign references and read-only resolution, immutable checkpoint pins, and canonical code opening through existing authorities.
3. Extend the CLI and HTTP adapters, consumer guidance, ADR 0060, and coverage. Preserve package ceilings and leave frontend and browser acceptance to the parent.
4. Merge the latest integration, run applicable backend checks, simplify, commit with signatures, release claims, stop the worktree server, and save the backend handoff. Keep the ticket In Progress and proposals draft.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The worktree starts at integration 5432fed897. The stable public contract is saved externally as task-549.15-contract.md. Draft proposals: Board persistence@TASK-549.15, Archboard server routes@TASK-549.15, Command interface@TASK-549.15. Public runtime RED/GREEN slices cover local and foreign bindings, explicit reference navigation, immutable foreign pins, missing retained content, changed source refusal, and foreign source associations. CLI/HTTP and existing opener system owners now pass their first new cases. The .06 source remains unmerged and uncopied.

Signed implementation checkpoints 96ad2f9a1 and a87f293bd implement explicit foreign subject references, immutable foreign checkpoint pins, canonical binding resolution, and existing-opener activation. Signed merge 8df910922 incorporates integration 3a0efd30d9624cb472d343d72a3dda3c4da9ca86. No unintegrated .06 source was merged or copied. The final simplification shares one checkout snapshot per reference list and keeps own-repository source evidence on its existing direct context. The new runtime fixtures isolate their registry without timeout changes. The three architecture proposals remain draft. Parent browser acceptance and final ticket closure remain pending. No acceptance criterion is claimed complete.

Backend handoff evidence: the broad runtime run passes 86 tests across 16 files. The focused post-simplification source run passes 9 tests, and canonical navigation/opener adapters pass 9 tests across 3 files. The wider existing adapter/opener run passes 148 tests, and the final CLI help/model/consumer run passes 21 tests. Both TypeScript projects, full lint and formatting pass. Architecture semantics has zero diagnostics, and the three affected draft code checks have zero warnings. Ten inherited code warnings remain on unrelated boards. The interface owner reports the existing board width of 245/188; the public entry diff is empty and no ceiling changes. The Canonical reads view was rendered and inspected. Browser acceptance and adoption remain with the parent.
<!-- SECTION:NOTES:END -->
