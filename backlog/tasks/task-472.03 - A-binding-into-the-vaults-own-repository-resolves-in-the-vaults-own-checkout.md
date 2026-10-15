---
id: TASK-472.03
title: A binding into the vault's own repository resolves in the vault's own checkout
status: Done
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 00:31'
labels: []
dependencies:
  - TASK-472.01
  - TASK-472.02
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 823000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check resolves every binding through the registry, so a proposal in a worktree is checked against the code of the main checkout, while `behind` already uses the git root of the vault. ADR 0049 sets one rule for every reader: a binding or anchor that names the identity of the vault's own checkout resolves in that checkout, and any other identity resolves in its chosen checkout.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a worktree whose vault binds to its own repository identity, `check --code` reads the worktree's files while another checkout of that identity is chosen
- [x] #2 A binding or anchor that names another identity resolves in that identity's chosen checkout
- [x] #3 Opening the code of a part on a board of a worktree's vault opens the worktree's file
- [x] #4 `behind`, footprint and locality follow the same rule
- [x] #5 One function owns the rule, and every reader calls it
- [x] #6 The archboard skill and the archboard-dev skill describe where a binding resolves as built
- [x] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. The rule, one function (src/runtime/code-target/lib/vault-checkout.ts, exported by code-target/index.ts): checkoutsReadFrom(vault) returns the checkouts a reader resolves identities in. vault is a path or null (a machine-wide reading with no vault: chosenCheckouts only). It is the chosen checkout of every identity, except that the checkout holding the vault (git rev-parse --show-toplevel from the vault, its identity from the remote, as repoIdentityAt reads it) takes its own identity's place, whether or not it is registered or chosen; a registered entry for that root keeps its language servers. An untracked vault (in no checkout) changes nothing. The probe is synchronous (Bun.spawnSync, bounded), because the polled vault check is synchronous and the route that calls it is TASK-472.04's.
2. snapshotCheckoutAccess takes a required vault (string or null) and builds its entries from that function, so every consumer of a snapshot gets the rule: the code opener (resolveTarget bound to the vault getter in createCodeOpenerRouter, machine-wide settings routes pass null), the code check (checkCode and readPlans take the vault first), behind, footprint (request.vault) and locality (read takes the vault first), their memory keys already hold each checkout's root and HEAD. The vault binding check (bindings.ts createCheckoutLookup(vault)) resolves through the same function. Route handlers keep passing the vault they already hold (code-check-route.ts, footprint-route.ts, locality-route.ts): one added argument each, no change of request handling.
3. Tests: a CLI-and-server system test (an owned server, isolated HOME, state dir and ARCHBOARD_REPOS; a git checkout and a linked worktree of it, the main checkout chosen, the worktree's vault binding to the shared identity): check --code reads the worktree's file; a binding to another identity reads that identity's chosen checkout; opening the code of a part in the worktree's vault names the worktree's file. Module tests only for hidden cases: an unregistered vault checkout, an untracked vault, null vault; behind, footprint, locality through one fixture.
4. Docs: skills/archboard (where a binding resolves), skills/archboard-dev (the sentence on bindings into an unregistered or unchosen repository), INSTALL.md if it says where bindings resolve, CONTEXT.md Chosen checkout/Binding only where they differ, generate:skill-artifacts.
5. Board proposals: Archboard@TASK-472.03 (Repository checkout datastore description; the server to registry relationship, re-anchored on code-target's vault-checkout.ts), Archboard server@TASK-472.03 and Archboard server routes@TASK-472.03 (Code check description: where it reads). No other board is affected. Drawn on 2026-10-15 before the code.
6. Gate, one lane at a time: lint, type-check, fmt:check, test:modules, test:system, test:repository, test:serial-browser.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built (commits: plan 94aabb9e4, code feat(code-target) and docs(cli) after 212e0f37b). Decisions:
- One function, checkoutsReadFrom(vault) in src/runtime/code-target/lib/vault-checkout.ts (exported by code-target). vault is a path or null; null is for the machine's opener settings, which belong to no vault and see chosen checkouts only. snapshotCheckoutAccess takes it as a required option, so every snapshot consumer (code opener, code check, behind, footprint, locality) gets the rule and none can forget it. bindings.ts (vault check) calls the same function through createCheckoutLookup(vault).
- The vault's checkout is found with two synchronous Bun.spawnSync git calls (rev-parse --show-toplevel, remote get-url origin, plus worktree list when there is no remote, per TASK-472.17's repoIdentityFor). Synchronous because checkSemanticVault, polled by every canvas, is synchronous and its route is TASK-472.04's; measured 2 ms per call. A Git failure means no own checkout, so the reader falls back to chosen checkouts.
- A registered entry for the vault's root keeps its language servers; an unregistered vault checkout has none. The entry is read as chosen for its identity in this reading.
- checkoutFor in repo-registry had no production caller left, so it is removed; its tests use chosenCheckouts.
- Fence: code-check-route.ts, footprint-route.ts, locality-route.ts and code-opener/lib/routes.ts were edited by the TASK-472.04 implementer at the same time; their versions pass the vault to my reader signatures (checkCode(vault, ...), readPlans(vault, ...), readFootprint({vault}), locality read(vault, ...), resolveTarget(binding, signal, vault)). I committed none of those four files. routes.ts holds my resolveInVault wiring (new file src/server/code-opener/lib/resolve-target.ts) and must be committed by the 472.04 implementer.
- Evidence: tests/system/cli/vault-checkout.test.ts (owned server, worktree vault, main chosen), tests/system/code-targets/vault-checkout.test.ts (opener), src/runtime/code-target/tests/vault-checkout.test.ts, src/runtime/history-lens/tests/own-checkout.test.ts, semantic-board-store/tests/bindings.test.ts. All eight fail when checkoutsReadFrom ignores the vault.
- Evals: no scenario's expectedFeatures or outcomes change, so evals/ is untouched.
- Board proposals: Archboard@TASK-472.03, Archboard server@TASK-472.03, Archboard server routes@TASK-472.03 (drawn at planning; check --code --variant TASK-472.03 introduces no finding and clears ANCHOR_SYMBOL_MISSING on the registry relationship, which the code move caused). Not adopted: closing is the parent's.

Board closing (steps 1 to 7), run 2026-10-15, after TASK-472.04 closed.
Archboard@TASK-472.03 (step 1: check --code --variant TASK-472.03 against the plain run): `<` ANCHOR_SYMBOL_MISSING on Archboard server -> Repository checkout (chosenCheckouts, now anchored in code-target's vault-checkout.ts); no `>` line from Archboard. The same run printed two `>` lines that are not about this proposal: on the stale Archboard server draft's reading (ANCHOR_SYMBOL_MISSING sendToAllClients, fixed by TASK-472.04) and Live panes' Browser origin guard being reached by Archboard server code, which comes from another task's uncommitted src/server/archboard files, not from this one. Step 2: the summary is the board's own scope. Step 3: footprint with base 212e0f37b (the parent of 2f5595c1f, the first TASK-472.03 code commit; current = TASK-472.02 = the proposal's parent): Repository checkout (repo-registry.ts) named and changed, nothing changedNotNamed or namedNotChanged; the 8 skipped parts are drill-downs and unbound containers. Adopted at version 46.
Archboard server@TASK-472.03 and Archboard server routes@TASK-472.03 were refused by the order of closing (TASK-472.04 adopted first, PARENT_SUPERSEDED). Step 5: branched "TASK-472.03 after TASK-472.04" from the current variant of each, restated only this task's change (compare TASK-472.03 --against its parent showed one changed part on each board: Code check's description, "registered checkouts" becomes "the vault's own checkout and the chosen ones"), kept TASK-472.04's sendToVaultClients anchor, and shelved the old TASK-472.03 proposals (Archboard server version 245 to 246, routes 16 to 17) because they were branched before TASK-472.04. Step 1 on the restated name: no `>` and no `<` line. Step 3 with base 212e0f37b: Code check is named and changed (3 commits: 2f5595c1f, b2b676b46, f6e658fc8) on both boards; namedNotChanged none. changedNotNamed are TASK-472.04's parts (read in its notes) plus History lens (2f5595c1f and e4891be46 make behind, footprint and locality read the checkout that holds the vault; its responsibility names no checkout, so it holds) and Code opener (resolve-target.ts is the opener resolving in the vault's checkout; its responsibility holds). Adopted: Archboard server at version 247, Archboard server routes at version 18.
Step 6: ./bin/dogfood check reports no diagnostics.
Step 7, behind: the boards 2f5595c1f and its siblings put behind and no proposal names are Command interface (Vault check, Locality and Footprint changed only help text: 57b179932, f6e658fc8; their responsibilities hold) and Board persistence (Binding checks and Vault diagnostics now resolve through checkoutsReadFrom; "a node whose binding names a file the repository no longer has" is still what they do, and Board persistence was not edited because TASK-472.12 may hold a proposal there). No board is wrong. Remaining warnings in the vault are not from this task: Board rasterizer's drawRequest anchor, Board persistence's two undrawn Drill-down checks relationships (TASK-472.12's uncommitted drill-down.ts) and Live panes' Browser origin guard (another task's uncommitted server files).

Correction to the closing note above: the old Archboard server and Archboard server routes proposals were not tried for adoption; they were restated and shelved because TASK-472.04 had already been adopted over their parent, which would have refused them as PARENT_SUPERSEDED.

Closing evidence: the complete gate (bun run check) passed in a clean worktree at 65c950de5, every lane, exit 0. It holds the tests the notes name: tests/system/cli/vault-checkout.test.ts, tests/system/code-targets/vault-checkout.test.ts, src/runtime/code-target/tests/vault-checkout.test.ts, src/runtime/history-lens/tests/own-checkout.test.ts and semantic-board-store/tests/bindings.test.ts. skills/archboard/references/authoring.md:98 and skills/archboard-dev/SKILL.md state where a binding resolves. Proposals adopted in 841631559.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
One function, checkoutsReadFrom(vault), now decides which checkout a vault reads: the vault's own checkout for its own repository identity, the chosen checkout for any other. The code check, the opener, behind, footprint, locality and the vault check all call it, so a worktree's vault reads the worktree's code while another checkout is chosen. Verified by the system and module tests named in the notes and by the complete gate at 65c950de5. The skills say where a binding resolves, and the Archboard, Archboard server and Archboard server routes proposals are adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
