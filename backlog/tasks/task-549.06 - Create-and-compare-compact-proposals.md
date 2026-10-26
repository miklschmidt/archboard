---
id: TASK-549.06
title: Create and compare compact proposals
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T19:44:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 6.

## What to build

Complete proposal snapshots make small architecture changes produce large review diffs.

An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.
- [x] #2 Support siblings, named predecessors, and planning-only models without a current state. New draft subjects remain outside current architecture until adoption.
- [x] #3 Preserve stable state identities, names, summaries, and documents. Additions, removals, assignments, explicit clearing, and placements have distinct meanings.
- [x] #4 Comparison defaults follow TASK-549. Unsupported predecessor changes refuse safely until reconciliation is available. Small edits store no unrelated snapshots.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration base 24f76895d and preserve completed flow, reader, and archive contracts.
2. Create draft Board persistence@TASK-549.06, Command interface@TASK-549.06, and Archboard server routes@TASK-549.06 proposals.
3. Record the early backend contract outside the repository. Use TDD at the approved architecture read/write seam with real files and Git.
4. Add compact identity changes, retained immutable baselines, state selection, metadata, safe predecessor refusal, and semantic comparisons through existing readers and durable writes.
5. Expose the contract through normal CLI and HTTP adapters. Update consumer guidance, examples, ADRs, test ownership, and evaluation inputs without model evaluation.
6. Run focused behavior, type, lint, formatting, and architecture checks. Simplify, merge latest integration, release claims, stop the server, and sign all commits.
7. Leave browser acceptance and task completion to the parent. Keep architecture proposals draft and TASK-549.06 In Progress.

8. Parent extends the existing router and query owner with explicit proposal/state and comparison selectors, preserving checkpoint exclusivity and all per-pane scope/focus/filter/grammar fields.

9. Add proposals to the existing state picker. Use selectedState lifecycle for draft, current, historical, and planning labels. Preserve unavailable selections and predecessor-change refusals without substitution.

10. Render comparisons through the existing semantic comparison and renderer mechanisms. Keep removed definitions tied to the coherent base revision. Show comparison metadata and field changes without architecture writes.

11. Refresh mutable selected drafts and their catalog through the existing event stream. Keep exact checkpoints separate, and label state-specific claims accurately.

12. Use short browser TDD slices with real temporary files and Git through public writes. Cover cross-module/flow drafts, comparison defaults, explicit bases, current isolation, retained draft identity, planning-only models, siblings, unavailable states, and live updates as required by visible acceptance.

13. Maintain Browser application@TASK-549.06 and the three backend drafts. Update complete-slice docs, ADRs, coverage, and test ownership. Run focused regression evidence, types, lint, formatting, metadata, architecture checks, and parent visual inspection.

14. Simplify, merge latest integration, adopt accurate proposals, release all claims, stop the server, complete proven criteria, sign the source, and dispatch its required integration merger.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend and CLI only. Initial HEAD equals feat/canonical-module-model at 24f76895d1555418782e973b021c4aceeb5a7f5c. No child agents, frontend source, browser tests, review phase, push, or PR changes. The owner already approved the public architecture read/write seam with real temporary files and Git.

Backend implementation now creates and edits compact proposals through the existing architecture write operation. The early contract is /home/msc/.local/state/archboard-implementation/task-549/task-549.06-contract.md. Current files remain unchanged. The public reader materializes named states and exact drafts with explicit lifecycle and comparison metadata. Nine focused real-file/Git cases pass, including planning roots, siblings, metadata, nested moves, exact retry, predecessor refusal, signing refusal, interrupted recovery and private archives. Existing semantic comparison and durable archive owners remain in use. Browser acceptance remains open, and all three task architecture proposals remain draft.

Backend acceptance evidence: nine proposal cases pass with 67 assertions at the approved public architecture read/write seam. They cover cross-module and flow deltas, sibling additions, named predecessors, planning roots, metadata, exact materialization, retained baseline garbage collection, explicit empty-baseline comparison, predecessor-change refusal, current byte preservation, stale revision and target refusals, signing failure, exact retry, interrupted recovery and private archives. The 59 existing module/flow/read/archive cases pass with 315 assertions. Five CLI/HTTP adapter cases pass with 58 assertions. Both TypeScript projects, full lint with zero warnings, formatting, and evaluation input validation pass. No evaluation model ran. Proposal code checks report zero warnings on Board persistence, Command interface, and Archboard server routes. Ten known warnings remain outside those boards. Semantics has zero diagnostics. The unchanged width gate remains board 245/188 and renderer 60/60 under TASK-549.24. No ceiling or lint/type rule changed.

Merged latest integration 5432fed897cd0b7bcbb8ada2c41dabd533305cca through signed merge cc0f88d30b07a4ba80335ba3cb8562e1e176e617. The merge preserves both histories and the complete committed TASK-549.11 delivery. Frontend source, browser tests, ui-kit, selection scope rules, and the Browser application board remain byte-identical to that integration head. No frontend implementation or browser test ran in this slice. The simplification pause keeps one canonical decoder, one identity authority, one durable transaction and archive engine, and the existing semantic comparison rules. Internal baseline reads skip discarded source/publication details. Acceptance criterion 1 remains open for parent browser work. Definition of Done item 2 remains open for the parent to close the complete mixed slice. All three task architecture proposals remain draft. Do not mark TASK-549.06 Done.

Closing backend records: Board persistence@TASK-549.06 is draft AFx23EEN at version 166; Command interface@TASK-549.06 is draft pJeSfYJs at version 189; Archboard server routes@TASK-549.06 is draft o6rDNILx at version 155. The closing graph comparison retains all 66 original parts (63 unchanged and three changed) and 188 original relationships, with one compact-proposal part and 13 explicit relationships added. All three claims are released, and the worktree server at http://127.0.0.1:16610 is stopped. The final contract and backend handoff remain outside the repository under /home/msc/.local/state/archboard-implementation/task-549. Browser criterion 1 and complete-slice documentation closure remain open for the parent.

Parent takes browser ownership after backend handoff b9f8de66b. Latest integration3a0efd30 includes completed .12 diagram modes. Merge resolution preserves the backend task record and completed criteria, both ADR sections, and both coverage entries. No backend work or retained architecture history is discarded. Browser state selection, lifecycle labels, comparison readings, mutable draft refresh, and visible acceptance remain to implement.

Parent browser proposal Browser application@TASK-549.06 now describes state selection, coherent comparisons, mutable query refresh, and renderer projection. It preserves all delivered .11 and .12 interaction responsibilities. The merged source passes types. Server16610 runs at PID1373887, and the parent holds Browser application while working.

First browser slice passes one case and seven assertions. Real HTTP proposal creation updates the existing state picker, selectedState drives explicit draft/current labels, module and flow changes read from the selected draft, reload preserves state, Current stays unchanged, and an exact checkpoint retains draft identity. State and checkpoint query keys are distinct and router selections are mutually exclusive. Source/frontend types and corrected full lint pass. The comparison summary shows the backend base metadata. Detailed comparison projection, mutable draft refresh, refusal/planning coverage, complete docs, and final adoption remain pending.
<!-- SECTION:NOTES:END -->
