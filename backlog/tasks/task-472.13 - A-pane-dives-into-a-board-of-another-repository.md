---
id: TASK-472.13
title: A pane dives into a board of another repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 04:58'
labels:
  - frontend
dependencies:
  - TASK-472.12
  - TASK-472.05
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 833000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once a drill-down can name another repository and a pane can show any repository, the pane dives into that board like any other drill-down (ADR 0050). Everything stays in one browser tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Activating a drill-down into another repository dives into that board in the same pane
- [ ] #2 The breadcrumb leads back across repositories
- [ ] #3 A drill-down into an identity with no known checkout opens nothing, and the inspector says that the repository is not registered and how to register it
- [ ] #4 PRODUCT.md and the archboard skill describe drill-down across repositories as built
- [ ] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design: a drill-down into another repository is a real move of the pane. The browser asks the server to show the board in that repository's vault (as the navigator does), the server moves the pane with pane_board, and the drill trail is carried across that arrival. A dive that only read the other vault inside the pane would break "the board the pane holds, everywhere" and the rule that a pane is in the vault the server put it in.

1. The board listing names the vault's own repository identity, and `drillPlace(target, own, places)` decides where a link lies: here (no repo, or the vault's own identity), there (a listed identity with a ready vault), unregistered (not listed), or unreachable (listed with no vault: gone, no-vault, unchosen). Untracked vaults are never drill targets. Module owner for drillPlace.
2. The inspector across repositories: the application provides the repository places to the canvas. Go deeper reads the target in its vault, and says for an unregistered identity that no checkout with a vault is known and to run `archboard repo add <dir>`, and for an unreachable one to choose another checkout in its menu. A double-click on such a card opens nothing.
3. The dive: a pure drill-trail reducer whose stops carry board, variant, vault and repository. Opening a stop in another vault asks the shell to show it there; the matching arrival keeps the trail, any other arrival resets it, a failure clears the pending dive. Going back to a stop in another vault is a move too. Module owner for the reducer.
4. The breadcrumb across repositories: each crumb reads and marks its level in its own vault, and a muted repository label starts each run of crumbs from one repository when the trail spans more than one.
5. One browser owner: a node in the served vault drills into a board of a second repository; the pane, the address (repoA) and the server inventory follow, and the crumb leads back.
6. Docs: PRODUCT.md and the archboard skill's authoring reference. Boards: proposals named TASK-472.13 on Board viewer and Browser application, drawn after the code lands.

Decisions: the dive goes through the address slot and pushes a history entry, so Back returns across repositories. A move the drill did not ask for clears the trail, as today. The dive is a plain move without the flight into the card for now. The inspector's read of another vault's board does not hear that vault's news; the server checks again on show.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
From the TASK-472.12 boundary review (2026-10-15): resolveDrillDown in src/ui/semantic-board-canvas/lib/drill-target.ts treats every drill-down with a repo as another repository, but the check and the listing now treat a repo equal to the vault's own identity as a local drill-down (vaultIdentity in src/runtime/code-target/lib/vault-checkout.ts, 47388b8d6 and 299fde5a8). Fix here: add the vault's identity to the board listing (listRoute already computes it), give resolveDrillDown and drillTargetName that identity, and treat target.repo equal to it as local in GoDeeper and use-drill-open.

Boards (2026-10-15): Board viewer@TASK-472.13 (Keep the drill trail, Repository places, Follow drill-downs and Open a card's board restated, five relationships added, one label changed) and Browser application@TASK-472.13 (Semantic viewer -> Application composition: move the pane into the repository a drill-down names; the stage relationship names each repository's vault). check --code with and without --variant TASK-472.13: no line differs. The existing EXPOSED_UNUSED information on Semantic viewer lists the test entrypoint src/ui/semantic-board-canvas/drilling.ts names (drillPlace, the trail reducer, useDrillDown, useLevelReading), the same pattern as lighting.ts. Footprint against base 23a435cb3: Board viewer namedAndChanged Follow drill-downs, Viewer entry point, Open or leave a board, Open a card's board, Keep the drill trail, Repository places; changedNotNamed Semantic viewer (container; its changed files are named parts and tests), Fetch semantic reads (the listing gains the vault's repository, which the board's 'the listing' relationship covers), Render stage states (the breadcrumb and Go deeper read where a link leads through Follow drill-downs, already drawn); namedNotChanged Semantic queries (only a relabelled relationship). Browser application namedAndChanged Application composition; changedNotNamed Shell (selectBoard now answers whether the pane shows the board; no relationship changes). Review: five reviewers (drill model, breadcrumb and inspector, shell, and the canvas/shell and trail/crumb boundaries) committed fixes 813540ac3, f660cf6a1, 2a2829898, 582662003, c8114fe24, 194700d19, 7f2069aa3, dd40b0a10, 99df3e83d, f16de902f, ea71d301e, 325663f48, 5647947b1, c03fa9729. Left as they are: a link reads 'not registered' while the repositories listing is still loading; a late card flight in an A-to-B-to-A trail still clears the selection (use-dive runs its last step after the picture changed); a refused dive leaves the departure state that the next move replaces.

Adopted Board viewer at v100 and Browser application at v61; archboard check: no diagnostics. check --code behind: of this task's commits only 3570b093c reaches another board, Board routes on Archboard server routes and the Archboard server container on Archboard server (the listing route now names the vault's repository). Both stay right: Board routes 'answers the reads: ... the catalogue' covers the listing, and the container draws no listing field. The other behind counts come from the TASK-472.07 and TASK-472.08 merges and older work.
<!-- SECTION:NOTES:END -->
