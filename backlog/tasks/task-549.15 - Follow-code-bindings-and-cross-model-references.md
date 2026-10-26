---
id: TASK-549.15
title: Follow code bindings and cross-model references
status: In Progress
assignee:
  - codex-parent
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T22:39:00Z'
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

5. Parent composes the integrated .06 state and comparison reader with navigation, retained foreign pins, code opening, and proposal preparation. Preserve both architecture histories and prove their interaction at the approved public runtime seam.

6. Parent creates Browser application@TASK-549.15, then implements visible source availability, existing-opener activation, and explicit cross-model navigation through the existing query cache and pane router. Use real file/Git fixtures and the existing browser adapter. Keep historical pins and unavailable source/model intent explicit without ownership changes.

7. Complete consumer and architecture descriptions, run affected runtime/browser/static evidence, inspect visible results, and simplify. Adopt accurate combined task proposals, release claims, stop the server, mark proven criteria Done, sign the source, and dispatch its required merger.

8. Use TASK-549.15-integration on Board persistence, Command interface, Archboard server routes, and Browser application. Each derives from adopted TASK-549.06. Preserve the original backend task variants as shelved provenance, with every subject identity carried into the combined reading.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The worktree starts at integration 5432fed897. The stable public contract is saved externally as task-549.15-contract.md. Draft proposals: Board persistence@TASK-549.15, Archboard server routes@TASK-549.15, Command interface@TASK-549.15. Public runtime RED/GREEN slices cover local and foreign bindings, explicit reference navigation, immutable foreign pins, missing retained content, changed source refusal, and foreign source associations. CLI/HTTP and existing opener system owners now pass their first new cases. The .06 source remains unmerged and uncopied.

Signed implementation checkpoints 96ad2f9a1 and a87f293bd implement explicit foreign subject references, immutable foreign checkpoint pins, canonical binding resolution, and existing-opener activation. Signed merge 8df910922 incorporates integration 3a0efd30d9624cb472d343d72a3dda3c4da9ca86. No unintegrated .06 source was merged or copied. The final simplification shares one checkout snapshot per reference list and keeps own-repository source evidence on its existing direct context. The new runtime fixtures isolate their registry without timeout changes. The three architecture proposals remain draft. Parent browser acceptance and final ticket closure remain pending. No acceptance criterion is claimed complete.

Backend handoff evidence: the broad runtime run passes 86 tests across 16 files. The focused post-simplification source run passes 9 tests, and canonical navigation/opener adapters pass 9 tests across 3 files. The wider existing adapter/opener run passes 148 tests, and the final CLI help/model/consumer run passes 21 tests. Both TypeScript projects, full lint and formatting pass. Architecture semantics has zero diagnostics, and the three affected draft code checks have zero warnings. Ten inherited code warnings remain on unrelated boards. The interface owner reports the existing board width of 245/188; the public entry diff is empty and no ceiling changes. The Canonical reads view was rendered and inspected. Browser acceptance and adoption remain with the parent.

Parent takes browser ownership after backend e08007684. Integration212ef722 includes completed .06 proposals. The in-progress merge preserves all original variant meanings and ancestry from both sources. Shared reader options will select one coherent state before navigation enrichment. The .07 backend delegate works separately from integration212ef722; it owns no frontend.

The combined proposal/reference runtime case now passes after failing proposal creation. The common preparation path receives the materialized draft, and retained baselines capture source associations and exact foreign pins. The fixture releases its initial claim before expanding scope. Eighteen reference/proposal cases pass with96assertions, and source/frontend types plus full lint pass. The composed reader preserves .06 state and comparison selectors before .15 navigation enrichment. Foreign draft selection, reference comparison fields, explicit draft code activation, and browser acceptance remain pending.

Foreign draft references now use the explicit selected state, preserve draft lifecycle, find an existing exact checkpoint for that state, and retain that pin for historical navigation. Proposal comparisons report references as an atomic field change. The corrected runtime regression failed on a foreign model/state mismatch, then passed1case/7assertions. Its fixture retains the current revision after foreign draft creation with a distinct operation identity. The combined references/proposals suite passes19cases/103assertions; source/frontend types and full lint pass. Explicit draft code activation and browser work remain pending.

Canonical code opening now accepts an explicit state or exact checkpoint, with those selectors mutually exclusive. The shared reader resolves that selected binding before the existing opener runs. A real-process regression first received HTTP400 for a draft request, then opened src/planned.ts while current retained src/index.ts. Missing states return MODEL_UNAVAILABLE without substitution. The canonical owner passes2cases/8assertions, all code-target/opener owners pass163cases/405assertions, and types/lint pass. Server12813 now runs at PID2897352 for parent architecture and browser work.

CLI-authored combined proposals now preserve both .06 and .15 architecture. Existing five navigation/source nodes and thirteen relationships are restored under their original IDs with explicit RESTORE_UNCONFIRMED authorization. The navigation call now targets selected-state reading, and compact proposal baselines explicitly capture foreign pins. The original backend variants are shelved with a reason and retain their content and ancestry. Browser application@TASK-549.15-integration adds module navigation to the existing reader, query access, code opener, and router. Backend claims are released; the parent holds Browser application for implementation. No current architecture is replaced or force-adopted.

The first browser slice now opens canonical module code through the existing public activateCodeTarget operation and shell notices. Navigation details use the same query cache and must match model, selected state, checkpoint, and complete revision before enabling the action. ModuleDetails composes the action beside authored evidence. The new browser owner passes1case/3assertions plus process-target polling for current, draft, and exact retained code; unavailable source keeps architecture readable with a disabled action. The initial missing-control RED precedes implementation. A later fixture correction selects the module after an uncached saved reading and moves helper files outside the source checkout. Types and corrected lint pass. Existing legacy activation owners pass9cases/19assertions. Foreign model navigation UI remains pending.

Foreign module navigation now resolves explicit repository addresses through the existing repository query, preserves model/state/checkpoint/subject in the pane router, and seeds only the explicit arrival selection. Pointer selection remains temporary. The shared read must return the captured destination before navigation; source-context changes cancel pending actions. Unbound modules can expose references independently of code. Missing live targets remain explicit, while exact local history reopens its pinned foreign checkpoint without restoring foreign files. The new browser owner reaches a missing-control RED after real repository registration, then passes1case/7assertions. References, code, navigation, and selection regressions pass6cases/34assertions. Source/frontend types and corrected full lint pass. Foreign non-module subject presentation, final visual inspection, architecture closure, and adoption remain pending.

Foreign references now open every canonical subject kind. An exact relationship inspects only its selected aggregate members and opens required endpoint paths. Collections offer their authored flows and participate in relevant-flow selection without becoming module nodes. Flow and step references reuse the returned containing flow and exact arrival identity. The expanded browser owner first failed on relationship inspection, then collection details, and now passes1case/13assertions. The final step failure was a below-viewport control in the test adapter; explicit scrollintoview plus a real hit-target wait fixes that fixture action. Parent inspected the failure screenshot and removed temporary capture/error logging. Types and lint pass. Readable reference labels and final complete-slice validation/architecture closure remain pending.
<!-- SECTION:NOTES:END -->
