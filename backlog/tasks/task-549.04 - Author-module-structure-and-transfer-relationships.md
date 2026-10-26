---
id: TASK-549.04
title: Author module structure and transfer relationships
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T15:24:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.03
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 4.

## What to build

Agents need to change module boundaries and connections without duplicating definitions or replacing identities.

An agent adds, removes, renames, or reparents modules and edits their relationships through normal commands. The browser reflects the resulting model.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent adds, removes, renames, or reparents modules and edits their relationships through normal commands. The browser reflects the resulting model.
- [x] #2 One operation can transfer a relationship source between files without changing its identity. Deletion repairs references under the existing confirmation rules.
- [x] #3 Extend claims and stale-read coverage to every affected subject and file. Conflicting claims refuse admission, while unrelated subjects remain available.
- [x] #4 Preserve reserved identities, former names, authored order, and containment rules. A one-field edit leaves unrelated files byte-identical.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the approved architecture read/write seam with checked module structure and relationship operations, using TASK-549.03 transactions and events.
2. Maintain Board persistence@TASK-549.04, Command interface@TASK-549.04, and Archboard server routes@TASK-549.04 as task drafts through the normal CLI.
3. Use short red-to-green runtime slices with real temporary files and Git repositories for module add/remove/rename/reparent, relationship edits and source transfer, claims, stale tokens, identity retirement, containment, and unrelated bytes.
4. Publish the stable shared request/result and event contract in the external task-549.04-contract.md handoff. Add normal CLI and HTTP adapters without frontend changes.
5. Update affected ADRs, consumer guidance, examples, and evaluation coverage. Run focused behavior, types, lint, formatting, semantics, and affected code checks. Simplify the resulting implementation.
6. Merge the latest integration tip, preserve all histories, leave proposals draft, release claims, stop the worktree server, and commit signed checkpoints. Keep TASK-549.04 In Progress for parent browser acceptance.

7. Parent browser closure: exercise live rename, relationship source transfer, root additions, reparenting, removal, and pinned historical readings through the existing browser adapter and public HTTP writer. Show the selected module parent and preserve explicit missing selection. Merge the publication integration before final validation, reconcile task proposals, and adopt only after complete evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend owner starts from clean feat/module-structure-transfers at integration d1d6d8524d1f7ba663cf5d347f0c3c341279e1f7. Parent owns apps/web and tests/system/browser. Public runtime and existing browser test seams already have owner approval. No child agents, push, PR edit, or review phase belong to this backend assignment.

Backend runtime now supports one checked batch for module add/remove/rename/reparent and relationship add/edit/remove/source transfer. New IDs use the existing authority. Former names, authored order, retired identity reservations, complete affected claims, stale tokens and unrelated bytes are preserved. Eleven new public-runtime cases pass, including real interrupted multi-file recovery and foreign-byte refusal. The CLI/HTTP owner passes three cases with a structural batch and fresh event snapshot. Source/browser types and full lint pass. Contract pointer: /home/msc/.local/state/archboard-implementation/task-549/task-549.04-contract.md. Three TASK-549.04 architecture drafts remain in progress. Frontend/browser acceptance remains parent-owned.

Backend delivery evidence: 60 public runtime tests pass across nine files, including eleven new structure/recovery cases. Three CLI/HTTP cases pass; the structural edit/event case passes again after the final CLI parser change. The contract/skill selection passes 31 cases, and its one default-timeout case passes on the focused 30-second-timeout command. Source and browser types, full lint with zero warnings, formatting, vault semantics, and all three affected proposal code checks pass. Ten known unrelated code warnings remain. Package API checks pass; the unchanged width gate reports board 234/188 and remains TASK-549.24 work. Evaluation-input checking refuses existing S20 capture and guidance-anchor errors; evals/evals.json is byte-identical to integration baseline d1d6d8524d1f7ba663cf5d347f0c3c341279e1f7. No model evaluation ran. Signed CLI fixture transfer/retry matches exactly and changes only gateway.module.json and worker.module.json. Every baseline variant, current designation, adoption and shelving remains exact. Delivery drafts are Board persistence@TASK-549.04 (QPUue1PK, version 131), Command interface@TASK-549.04 (p7gVQwFB, version 167), and Archboard server routes@TASK-549.04 (ZAL4r7Bj, version 132). They remain draft for parent browser closure. Frontend source and browser tests match the baseline exactly. Latest integration merge is already up to date at d1d6d8524d1f7ba663cf5d347f0c3c341279e1f7. Do not consume TASK-549.16 source directly. TASK-549.04 remains In Progress; acceptance criterion 1 and full documentation/architecture closure remain parent-owned.

Parent structural browser path passes one case with nine assertions. It verifies pinned historical content after current rename/addition/transfer, live parent changes, and explicit missing selection after deletion. The missing-parent presentation red is fixed. Parent also repairs the existing TASK-549.19 evaluation metadata: S20 now has named harness captures and an existing guidance anchor; migration coverage stays intact under the established document-state category instead of invalid part15. No schema or validation rule changes and no model evaluation runs.
<!-- SECTION:NOTES:END -->
