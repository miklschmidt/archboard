---
id: TASK-549.02
title: Retain and reopen exact architecture checkpoints
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T09:27:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.01
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 2.

## What to build

Historical readings need retained architecture inputs that survive changes to the code branch.

An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.
- [x] #2 Preserve required inputs through Git ancestry or retention refs. Honor configured identity and signing without changing the user index, HEAD, or checkout.
- [x] #3 Concurrent archive appends preserve both checkpoints through marked synchronization commits. Archive order never selects current architecture or merges architectural meaning.
- [x] #4 Linked worktrees share archive objects and refs. Exact reads identify missing architecture or source evidence and provide a recovery action.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the agreed public runtime seam with real temporary files and Git repositories. The parent owns the existing browser seam.
2. Create TASK-549.02 draft proposals on Board persistence, Command interface, and Archboard server routes before architectural edits.
3. Add exact local retain/read/list contracts behind the architecture runtime, with configured signing, source evidence, shared worktree archive refs, dependency retention, and conditional append synchronization. Use one failing test before each behavior.
4. Expose the runtime through CLI, HTTP, and the canonical client. Update affected ADR/domain terms, consumer guidance, fixture workflow, and evaluated scenarios.
5. Run focused behavior tests and relevant type, lint, and formatting gates. Simplify, commit signed work, merge the latest integration tip, and record the backend handoff. Leave browser AC 1 and the ticket open.

6. Add a reading selector in the existing model header. Current stays explicit. Saved readings use checkpoint-specific query keys and never reuse current content.

7. Show the exact checkpoint identity and source-evidence availability. Keep history reachable when current inputs are invalid or missing, and provide explicit retry and return-to-current actions.

8. Extend the existing real-browser seam with a temporary Git fixture. Prove changed current content, exact reopening, missing architecture, unavailable source evidence, and recovery without browser writes.

9. Update Browser application@TASK-549.02, the consumer guide, and all affected proposal evidence. Adopt completed proposals, finalize the ticket, commit with signing, and merge the integration tip before the merger handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial HEAD f1b91c9a98537a29238ac1575f45d2fcfd5d3259 equals feat/canonical-module-model and contains it. The worktree starts clean. Configured SSH signing succeeds through commit-tree and git verify-commit. Dependencies installed with bun install --frozen-lockfile without lock changes. No parent task notes will change.

Backend checkpoint: exact retain/read/list runtime and public CLI/HTTP/client contracts are implemented. Real red/green evidence is saved under /home/msc/.local/state/archboard-implementation/task-549/task-549.02-evidence. Proven slices include exact reads after current corruption, configured SSH signing and identity with dirty-index preservation, baseline ancestry and collection, concurrent linked-worktree synchronization, missing source evidence, durable operation retries, signing refusal, shallow missing baselines, reserved archive branch protection, Git-sensitive paths and large UTF-8 inputs, and unborn source history. TASK-549.02 proposals remain draft. Browser work remains with the parent.

Backend evidence: 40 focused tests pass across canonical runtime, CLI/HTTP, command help and skill policy owners. The broader board, Git-process, CLI-contract and package-contract run passes 604 tests. Source and browser TypeScript projects pass. Full lint reports zero warnings and errors, and formatting passes. The deterministic skill input check passes with no model evaluation. Architecture semantics report no diagnostics. The three TASK-549.02 proposals have no code warnings; the full-vault code check retains 12 existing warnings on other boards. The code check cannot assess the Commands container interface because that directory has no export root. Its concrete command files and client boundaries were assessed. Final simplification places Git object reads and retention-ref updates in the private archive store, so operations retain the domain contract and no duplicate content cache exists. Consumer guidance, coverage inventory, glossary and ADR 0059 match this backend slice. AC 1 remains unchecked because the browser selector and browser evidence belong to the parent. All proposals remain draft.

The parent implemented the browser reading selector, exact identity and source evidence, and explicit archive recovery. Current remains an explicit choice. Query keys separate retained snapshots from working files, and selection refetches its own reading. A regression caught stale current-cache reuse and an automatic select-control fallback when checkpoint metadata disappeared. The selector now preserves the chosen identity even when it is absent from the catalogue. The canonical cases use a dedicated owner under the existing browser adapter. Both canonical and both legacy viewer cases pass. Source and frontend types pass; full lint reports zero warnings. Light and dark inspection is complete, and all temporary probes and capture code are removed. Four affected TASK-549.02 proposals have no code findings; 12 existing warnings remain on unrelated boards. Closure and adoption remain next.
<!-- SECTION:NOTES:END -->
