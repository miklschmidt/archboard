---
id: TASK-549.07
title: Reconcile and settle dependent proposals
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T21:45:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 937000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 7.

## What to build

Dependent proposals must inherit safe changes without losing disputed work.

An agent changes a predecessor and sees safe inherited changes across following drafts. Conflicts remain visible in both CLI results and browser readings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent changes a predecessor and sees safe inherited changes across following drafts. Conflicts remain visible in both CLI results and browser readings.
- [ ] #2 Preserve the baseline that established each conflict. Reconcile parents before children, block unsettled descendants, and publish the complete family result together.
- [ ] #3 Settlement handles competing fields, deletion against change, lost references, alternative renames, and structural ordering. Claims cover the affected descendants.
- [ ] #4 Reuse the existing semantic reconciliation cases through the public operation seam. No second transport-specific reconciliation path exists.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing architecture read/write seam with retained reconciliation standing and explicit settlement. Publish task-549.07-contract.md for parent browser work.
2. Create draft TASK-549.07 proposals on Board persistence, Command interface, and Archboard server routes. Preserve current variants and all identities.
3. Use TDD with real temporary files and Git through the public architecture operations. Reuse the semantic reconciliation engine, then publish complete families through the existing durable journal.
4. Cover descendant claims, blocked ancestry, conflict preservation, settlement, exact retries, and recovery. Adapt normal CLI/HTTP results without another engine.
5. Update consumer guidance, ADR0061, test ownership, and evaluation coverage. Run focused regressions, types, lint, formatting, and proposal checks without model evaluations.
6. Pause for simplification, merge latest signed integration, release claims, stop the server, commit clean source, and hand off backend evidence. Leave task In Progress and proposals draft.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started from clean signed integration 212ef722bd5b0b9d6ce976119231be8d6378abb8. TASK-549.06 is Done and integrated. Parent owns frontend and full acceptance. Public operation seams and signed branch work are approved.

Published early backend contract beside the delegate brief. Created draft TASK-549.07 proposals on Board persistence, Command interface and Archboard server routes. First public operation test failed on descendant claim scopes, then passed after claim validation and parent-first family candidate integration. Source and browser type checks found one result narrowing issue, now corrected. No frontend source or browser tests changed.

Public runtime cases now pass safe two-level inheritance, retained conflict standing, blocked-child refusal, explicit mine/theirs settlement, deletion against modification, exact settlement retry, alternative renames, competing holders and empty-flow preservation. A deleted subject kept by settlement carries a retained restoration proof, so the existing identity authority never treats it as a fresh allocation. The original conflict baseline remains unchanged until settlement.

Expanded public operation coverage for lost owners, independent arrivals, complete settlement refusal, external reconciliation and a forced interruption after the first installed file. Existing semantic rules remain the merge authority. The parent contract now requires complete, non-overlapping settlement choices to avoid a second partial-decision mechanism. Source/frontend types and full lint pass. The known board interface ceiling stays unchanged. Consumer instructions, ADR0061, test ownership and evaluation coverage now describe this slice. No model evaluations run.

A public regression exposed the existing per-flow step merge limit. The same semantic engine now reconciles continuing step identities globally and keeps flow plus nested holder as one placement. Independent fields inherit after cross-flow moves. Competing moves preserve the complete proposal side. The unchanged semantic reconciliation suite passes 35 cases/95 assertions. Board persistence proposal now shows the shared semantic authority used by canonical and legacy families. The CLI/HTTP family adapter owner passes, including structured blocked refusal and complete settlement.

Shared legacy durability exposed canonical-only undefined fields crossing into legacy content. Canonical extension fields now stay absent unless a side authors them. Legacy reconciliation, comparison, propagation and settlement pass 120 cases/401 assertions. Order settlement reuses the shared order rule and updates the complete sibling chain, including a middle step whose absolute position stays the same. Mixed choices for one holder refuse. Interface measurement remains board 245/188, the known TASK-549.24 excess. No ceiling changes.

The final lifecycle regression proves that a child created from an unsettled proposal starts blocked in its creation receipt and first reading. Creation no longer labels that child settled. The early contract includes this behavior and complete-holder order choices. No adoption, shelving, correction, frontend source, browser tests, or Browser application architecture changed.
<!-- SECTION:NOTES:END -->
