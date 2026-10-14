---
id: TASK-472.01
title: The store and every vault reader take the vault as an argument
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-14 22:43'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 821000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every reader of the vault reaches it through one process-wide default, `requireVaultRoot()`, which `config.ts` reads from `ARCHBOARD_VAULT` once at import. ADR 0049 makes one server serve many vaults, so each reader must be told which vault it reads. This is the prefactor of the migration: the server still serves exactly one vault, and nothing visible changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No function of the board store, the lock and lease state, the board catalogue, the vault configuration, former-name lookup, board listing, board location, vault diagnostics or the code check has a default vault: each takes the vault root from its caller
- [x] #2 The process-wide vault is read in one place for the server and one place for the CLI, and passed down from there
- [x] #3 Behaviour is unchanged: existing tests pass, changed only where a test called a function without a vault
- [x] #4 AGENTS.md, docs/agents/boundaries.md and the archboard-dev skill say nothing that this refactor made false
- [x] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the vault an argument. Remove requireVaultRoot from engine/lib/board-address.ts and engine/board.ts. Every store reader takes the vault root with no default: listSemanticBoards, locateSemanticBoard, resolveSemanticBoard, readSemanticBoardConfiguration, semanticBoardConfigurationPath, checkSemanticVault, readSemanticBoard(vault, asked), readSemanticBoardAt(vault, location, configured?). Write and discard commands carry vault. The lock layer carries it: LockRequest.vault, lockPathFor/boardLockState/releaseHold/renewRecord/takeHandoff/recordLockCommit take it, ClaimEntry remembers the vault of its claim, watchBoardLocks takes { vault, boards }. readBoardCatalogue and watchBoardCatalogue take the root.
2. One reader per process. Server: new src/server/archboard/lib/server-vault.ts (serverVault()), used by every route and by server-startup's refusal, and passed to createCodeOpenerRouter as a getter. CLI: spawn.ts keeps its pre-spawn check on the config constant (the one CLI read).
3. Update every caller and test that called a function without a vault; drop the own-vault guard, which the store cannot fail any more.
4. Board proposal: no board is affected. The change threads a parameter through existing calls. It adds, removes, renames or rewires no part, relationship or responsibility that any dogfood board draws (checked: no board part or edge names requireVaultRoot, the process vault or the lock path; ./bin/dogfood check --code shows no finding on the touched files). No proposal, no vault commit.
5. Gate: lint, type-check, fmt:check, test:modules, test:system, test:repository, test:serial-browser, one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned (commits 9720b707d, f7e5e9119). Decisions:
- Process memory stays keyed by board alone (claims, revocations, announcements). Only the lease path takes the vault; a ClaimEntry remembers the vault of its claim, so claimOn/claimWriterId/releaseClaim/takeClaimRevocation keep their signatures. TASK-472.04 keys them by vault and board.
- LockSink (board, holder) is unchanged for the same reason.
- The server's one reader is serverVault() in src/server/archboard/lib/server-vault.ts. Routes call it at the boundary into the runtime; TASK-472.04 replaces those calls with the vault the request names. createCodeOpenerRouter (src/server/code-opener, outside the stated fence but it called readSemanticBoard) takes a vault getter, because application.ts builds the router at import time, before the server has checked for a vault.
- The CLI's one read stays spawn.ts's pre-spawn check on the engine/config.ts constant. install-skill's repo-setup-block still offers an ARCHBOARD_VAULT it finds in the environment; TASK-471.03/472.09 remove that, so it was left.
- scripts/build-pipeline-example.ts reads the config constant once at the top and passes it down; scripts/engine-gallery.ts passes its copy.
- Tests: passed a vault where they called without one. Deleted tests/own-vault.ts and its 21 guards (the store cannot land outside the vault it is given). The two server owners that exercise serverVault() keep a guard, now comparing the config's vault with the test's. opener-fixture takes an optional vault for the real binding lookup.
- Fence: no file of the registry, repo commands, code-target, checkouts.ts or history-lens was touched.
- Board proposal: none. No dogfood board draws the process vault, the lease path or the store arguments; no part or relationship is added, removed, renamed or rewired. check --code on the final tree shows no finding on the touched files (the 3 ANCHOR_SYMBOL_MISSING were TASK-472.02's work in progress and an old rasterize anchor).
- AGENTS.md, docs/agents/boundaries.md and the archboard-dev skill name none of the removed things; config.ts's comment about noVaultMessage was corrected.
Gate: lint 0, type-check 0, fmt:check 0, test:modules 4543 pass 0 fail, test:system 203 pass 0 fail (after fixing activation-contract's two real-lookup tests), test:repository 27 pass, test:serial-browser exit 0, opt-in topology 1 pass.

Closing (parent, 2026-10-15). Review fixes 5863cfa6c and 7190f99a8 removed two test checks that could no longer fail. The boundary review with TASK-472.02 found no behaviour problem. Complete gate on 0166b9058: bun run check exit 0 (modules 4544 pass, system 202 pass, repository 27 pass, serial browser 19 of 19). No board proposal: the reviewer read Board persistence, Archboard server and Live panes, and none draws the process vault, the lease path or the store arguments; they are behind the refactor commits and still right. Handed to TASK-472.07: unused ARCHBOARD_VAULT setup in about 30 unit tests. Outside this task, for the owner: recordLockCommit has no caller, so the handoff-receipt path never runs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every vault reader now takes the vault from its caller: requireVaultRoot() is gone, the server reads its one vault in server-vault.ts and the CLI in spawn.ts, and behaviour is unchanged. Verified by type-check (every vault parameter required), two reviews, and bun run check exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->
