---
id: TASK-549.18
title: Export and import a complete portable model
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-27T10:37:00Z'
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

5. Parent composes the completed original-history implementation, then proves that imported planning-only checkpoints remain readable through the existing history and comparison selectors. Add the two required null-state labels without another UI owner. Browser application already describes planning and exact readings accurately, so this label completion needs no new architecture proposal. Reuse runtime and adapter evidence for imported modules, proposals, decisions, walkthroughs and recovery. Restate the three backend proposals onto current architecture, run affected checks, adopt and close.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Published task-549.18-contract.md in the approved state directory. Draft proposals: Board persistence@TASK-549.18, Command interface@TASK-549.18, Archboard server routes@TASK-549.18. First public runtime round trip and incomplete narrative closure cases pass. Import extends the existing journal and signer. Planning-only import requires nullable checkpoint state metadata. The parent owns null-state labels in ModelReadingSelector.tsx and ModelComparisonSelector.tsx; no frontend files changed.

Public portability evidence passes four cases across portable.test.ts and portable-history.test.ts. The immutable closure is checked once per retained input, with actual Git ancestry kept separate from proposal lineage. Full lint passes without rule changes. Type checking reports only the two parent-owned selector labels that require a null-state fallback. The remaining runtime work covers private restoration, signing and interruption.

Backend evidence now covers nine portability runtime cases plus CLI/HTTP parity. The broad shared run passes 57/60 cases and reaches a five-second timeout in the original round-trip test and two unchanged reconciliation cases. Round-trip preparation now runs before its assertion window, which passes in 4.1 seconds without a deadline change. Both reconciliation cases pass separately on exact starting source 5d2f45465332b84c59d19c3a7c21ee2b8abd8aae and current source, with matching durations. Other passing shared evidence is reused. Consumer contracts pass 33 cases, package API contracts pass 66, full lint has zero warnings, and evaluation inputs validate 21 scenarios and fixtures. Package width remains the inherited TASK-549.24 issue: board now exports 250 names against 188, from the inherited 245. No ceiling changed. Final proposals have zero affected code warnings and semantics have zero diagnostics. The same eight unrelated Archboard warnings remain. Prior architecture variants, views and lifecycle records remain exact. The task and proposals remain open for parent acceptance.

Final signed implementation checkpoint: 8fac3dc80be3ca6a16bc974675b2905aa0afa2c3, after c78808ce9327ff58038dd367b16ceadc3f80d6eb. Both use configured signing. Merged latest local feat/canonical-module-model at 5d2f45465332b84c59d19c3a7c21ee2b8abd8aae before handoff; Git reports Already up to date. The simplification pass retains one Git archive engine and one installation journal. It hashes the import envelope into the signed request instead of retaining a second bundle copy. Dependency verification uses one actual ancestry graph instead of repeatedly materializing every historical state. No frontend changes, child agents, reviews, pushes, PR actions, proposal adoptions, or task closure occurred.

Signed preparation merge edbd5f0ee8754498e4b190cf08414c0ae1a0eb39 includes integration a778a5a03c5d3dcaba7266a59b07597f08295384. All original variants, parents, decisions and views remain preserved, .18 proposals remain draft, and incoming .21 current pointers are retained. Focused portable and legacy-preview history/retention evidence passes15 cases87 assertions through the configured preload and default deadline. Types report only the two known nullable checkpoint labels. Parent now owns visible acceptance and those labels.

Parent browser acceptance passes one case with four assertions. The fixture exports a planning-only model, imports it into a fresh Git repository, and opens its exact checkpoint through reading and comparison controls, including reload. The two selector labels now handle null checkpoint state without inventing an implemented state. Full source and frontend types and lint pass. Consumer guidance, test ownership and evaluation coverage name this visible owner. The existing Browser application description remains accurate and needs no new proposal for these two labels. Final architecture restatement, acceptance checks and adoption remain.
<!-- SECTION:NOTES:END -->
