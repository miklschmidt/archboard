---
id: TASK-549.04
title: Author module structure and transfer relationships
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T14:41:00Z'
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
- [ ] #2 One operation can transfer a relationship source between files without changing its identity. Deletion repairs references under the existing confirmation rules.
- [ ] #3 Extend claims and stale-read coverage to every affected subject and file. Conflicting claims refuse admission, while unrelated subjects remain available.
- [ ] #4 Preserve reserved identities, former names, authored order, and containment rules. A one-field edit leaves unrelated files byte-identical.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend owner starts from clean feat/module-structure-transfers at integration d1d6d8524d1f7ba663cf5d347f0c3c341279e1f7. Parent owns apps/web and tests/system/browser. Public runtime and existing browser test seams already have owner approval. No child agents, push, PR edit, or review phase belong to this backend assignment.

Backend runtime now supports one checked batch for module add/remove/rename/reparent and relationship add/edit/remove/source transfer. New IDs use the existing authority. Former names, authored order, retired identity reservations, complete affected claims, stale tokens and unrelated bytes are preserved. Eleven new public-runtime cases pass, including real interrupted multi-file recovery and foreign-byte refusal. The CLI/HTTP owner passes three cases with a structural batch and fresh event snapshot. Source/browser types and full lint pass. Contract pointer: /home/msc/.local/state/archboard-implementation/task-549/task-549.04-contract.md. Three TASK-549.04 architecture drafts remain in progress. Frontend/browser acceptance remains parent-owned.
<!-- SECTION:NOTES:END -->
