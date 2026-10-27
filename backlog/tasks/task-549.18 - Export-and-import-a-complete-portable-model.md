---
id: TASK-549.18
title: Export and import a complete portable model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T09:30:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.08
  - TASK-549.14
  - TASK-549.17
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 948000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 18.

## What to build

A portable model needs its referenced history as well as its current JSON inputs.

An owner exports current inputs and required history, then imports them into a fresh location. Modules, proposals, decisions, and walkthroughs remain usable.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.08, TASK-549.14, TASK-549.17
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner exports current inputs and required history, then imports them into a fresh location. Modules, proposals, decisions, and walkthroughs remain usable.
- [ ] #2 Include every referenced baseline and checkpoint, including private archives. Preserve identities and refuse incomplete bundles before exposing an imported model.
- [ ] #3 Import uses the existing installation contract. A restored bundle can supply lost local history without claiming that archive deletion is impossible.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Publish the portable runtime, CLI, HTTP, refusal, and fixture contract. Create draft TASK-549.18 proposals on Board persistence, Command interface, and Archboard server routes.
2. Use TDD through public architecture operations with real temporary files and Git. Export complete authored inputs and archive closure. Import through the existing journal, lease, signer, retention, and recovery.
3. Cover dependency refusal, private archives, lifecycle and correction history, standing conflicts, exact narrative targets, retry, interruption, foreign edits, signing, and source isolation.
4. Keep adapters thin. Update consumer instructions, ADR 0059, domain language, and test ownership. Merge latest integration, simplify, sign checkpoints, and hand off with proposals draft and task In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Published task-549.18-contract.md in the approved state directory. Draft proposals: Board persistence@TASK-549.18, Command interface@TASK-549.18, Archboard server routes@TASK-549.18. First public runtime round trip and incomplete narrative closure cases pass. Import extends the existing journal and signer. Planning-only import requires nullable checkpoint state metadata. The parent owns null-state labels in ModelReadingSelector.tsx and ModelComparisonSelector.tsx; no frontend files changed.

Public portability evidence passes four cases across portable.test.ts and portable-history.test.ts. The immutable closure is checked once per retained input, with actual Git ancestry kept separate from proposal lineage. Full lint passes without rule changes. Type checking reports only the two parent-owned selector labels that require a null-state fallback. The remaining runtime work covers private restoration, signing and interruption.
<!-- SECTION:NOTES:END -->
