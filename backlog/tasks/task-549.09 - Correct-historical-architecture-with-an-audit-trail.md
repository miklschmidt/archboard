---
id: TASK-549.09
title: Correct historical architecture with an audit trail
status: In Progress
assignee:
  - '@codex-implementation'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-27T03:40:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.08
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 9.

## What to build

Historical factual errors need explicit corrections that preserve the original record.

An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.08
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent explicitly corrects a historical or shelved state with a reason and source references. Readers see the correction through its lasting state identity.
- [ ] #2 The original checkpoint remains exact and readable. Ordinary edits to historical states still fail. Comparisons expose the correction and its audit trail.
- [ ] #3 Following local drafts reconcile against the correction. Adopted successors and unrelated current states remain unchanged.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement the approved backend/shared contract/CLI/server slice only.
1. Confirm signed integration ancestry before runtime work.
2. Claim Board persistence, Command interface, and Archboard server routes. Create TASK-549.09 draft proposals.
3. Publish the shared correction contract and browser fixture recipe in the durable task directory.
4. Use public architecture operations with real files and Git for focused RED/GREEN correction, exact history, family reconciliation, recovery, and adapter coverage.
5. Update consumer instructions, ADRs, domain terms, and test ownership. Run required affected gates without changing limits.
6. Merge latest integration, simplify, sign commits, release claims, stop this server, and publish backend handoff. Parent owns frontend acceptance, adoption, and closure.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed signed bd3566cadd9478ac749393d711e5f730fb722744 includes source 4e8320d1b and main a98f28811 before tests or servers. Claimed and authored draft proposals Board persistence@TASK-549.09 (7XP2HHCT), Command interface@TASK-549.09 (7Dr76nZE), and Archboard server routes@TASK-549.09 (Mt2loqNM). Early contract and parent fixture: /home/msc/.local/state/archboard-implementation/task-549/task-549.09-contract.md. Public real-file/Git architecture operations are the approved primary seam. Parent owns frontend acceptance.
<!-- SECTION:NOTES:END -->
