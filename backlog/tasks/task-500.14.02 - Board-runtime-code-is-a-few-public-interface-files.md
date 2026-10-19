---
id: TASK-500.14.02
title: Board runtime code is a few public interface files
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 09:18'
updated_date: '2026-10-19 09:44'
labels: []
dependencies:
  - TASK-500.14.01
parent_task_id: TASK-500.14
ordinal: 881000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
board exposes 20 runtime subpaths. The Codex review groups them: address (address, location), store-read (read, listing, catalogue, bound-vaults, decode), vault-policy (configuration, diagnostics), store-move (move, move-preview, which share cross-vault rules), and doing and lock stay as they are. The write capability (write, transitions, accepted, discard, rename, propagate) is the next task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/board runtime exports are address, store-read, vault-policy, store-move, doing, lock and the write interface of the next task, and every other name is private
- [ ] #2 The persistence invariants hold: every write through atomic-write, lease lock deny by default, and the persistence tests pass unchanged in assertions
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Role folder packages/board/src/runtime/api (same rules as shared/api: only files that runtime exports name; curated re-exports of names that code outside packages/board imports; no export *; private files never import api files, by # specifier or by the package name; extend tests/system/repository-policy/package-api.test.ts to adopt board runtime: ADOPTERS gets the runtime area).
2. Seven api files (Codex grouping): address (address, location), store-read (read, listing, catalogue, bound-vaults, decode), vault-policy (configuration, diagnostics, and the runtime subject names), doing, lock, store-move (move, move-preview), store-write (write, transitions, accepted, discard, rename, propagate). Check the importers first and adjust a name that fits another file better; report. Names no outside file imports stay private. Subject diagnostics that are pure and browser-safe stay with the shared policy api (Codex: keep shared diagnostic names under their existing api owner); only runtime-bound names go to vault-policy.
3. package.json: remove the 20 runtime subpaths, add the 7 api subpaths. Rewrite outside importers by (old subpath, name) with /tmp/pm/board/regroup.ts adapted; add the Codex check to the dry run: the new import resolves to the same definition with the same alias and type or value form. Handle the four dynamic imports in opener-persistence.test.ts, mock.module strings and the filesystem-path load of the private lock file in tests/system/process-contracts/fixtures/process-resource-owner.ts (it loads a private lock implementation by path: point it at the public lock or document why it must stay).
4. Fresh-process load of every export, import-order scenarios (store-write first, store-read first, lock first), no value cycle, browser trace: runtime files unreachable. The persistence tests pass with unchanged assertions. bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope decision: .02 also groups the write files as one curated api file (store-write: write, transitions, accepted, discard, rename, propagate, only the names outside code imports), mechanically like the shared half. The deeper redesign (callers pass a declared operation, the module owns transition selection) stays in .03 and no longer blocks the package moves.
<!-- SECTION:NOTES:END -->
