---
id: TASK-549.20
title: Preview the composed current model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T02:36:00Z'
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
<!-- SECTION:PLAN:END -->
