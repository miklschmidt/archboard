---
id: TASK-472.15
title: archboard semantic move moves a board to another repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 06:21'
labels: []
dependencies:
  - TASK-472.12
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 835000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board sometimes lives in the wrong repository, for example a board that a meta project drew for a product repository. ADR 0051 decides the move: the whole note moves with every variant, former name and subject id, drill-downs that the move changes are rewritten to name repository identities, and the writes run in a fixed order because two vaults cannot share one write. This task builds the store operation and its CLI form; the browser task after it adds the control.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard semantic move <board> --to <dir> --doing <line>` moves the whole note into the vault found from `<dir>`, with every variant, former name and subject id unchanged
- [ ] #2 Drill-downs in the source vault into the moved board, and drill-downs on the moved board into the source vault, are rewritten to name repository identities
- [ ] #3 The move refuses between two checkouts of one identity, while another holder claims the board or its name in the target, when the target vault has a board or former name of that name, and when it needs a drill-down into an untracked vault
- [ ] #4 The move holds the lease in both vaults, writes the target note first, rewrites the drill-downs, and deletes the source note last; a move that stopped part way leaves the board in both vaults, and running it again finishes it
- [ ] #5 The answer lists every rewritten drill-down
- [ ] #6 The archboard skill and the help of `semantic move` describe the move and its refusals
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store: src/runtime/semantic-board-store/lib/move.ts exports moveSemanticBoard({vault, board, to, writer, expectedVersion?, signal?}). It takes the target name's lease in the target vault (async, admitted as write.ts admits), then the source board's lease through underBoardLease, and runs one synchronous pass: read the source (expected version checked), refuse a same vault or two checkouts of one identity (vaultIdentity), refuse when the target holds a board or former name of the board's name or any of its former names (a target board with the same board id is the earlier half of this move and is overwritten), plan the drill-downs (source boards whose drill-down opens the moved board get repo: target identity; the moved board's own vault-local drill-downs get repo: source identity), refuse when one needs an untracked vault's identity, then write the target note (acceptedBoard against the source board, so version +1 and no vocabulary refusal), rewrite each source board under its own nonblocking lease (withBoardLockIfFreeSync), and unlink the source note last. A rewrite that cannot take its board's lease stops the move as MOVE_STOPPED with the board in both vaults; running the same move again finishes it. Releases this writer's claim on the source board, as discard does.
2. Server: POST /api/semantic-boards/move (src/server/archboard/lib/semantic-board-move.ts): envelope, --doing, optional expectVersion, body move.to = target vault directory (namedVault, VAULT_UNREADABLE). Announces board_note for the target, each rewritten board and the source (discarded), the doing line on both. Answers {board, version, from:{vault,repository}, to:{vault,repository}, rewritten:[{vault,board,variant,node,drillDown}]}.
3. Client + CLI: moveSemanticBoardOnServer in semantic-board-client; src/cli/commands/semantic-move.ts (semantic move <board> --to <dir> --doing, optional --expect-version); --to is found as -C finds a vault and registered when unknown (helper exported from command-routing). Refusals declared: MOVE_SAME_REPOSITORY, MOVE_NEEDS_IDENTITY, BOARD_EXISTS, MOVE_STOPPED, plus the board-write ones.
4. Tests: module owner src/runtime/semantic-board-store/tests/move.test.ts (whole note with variants, former names and ids; both rewrite directions; each refusal; the stopped-part-way move and its re-run). System owner tests/system/cli/semantic-move.test.ts (the CLI move through an owned server: exit 0, files in both vaults, answer lists rewritten drill-downs; one refusal exit status).
5. Docs: archboard skill (references/edit.md and SKILL.md command list), the semantic move help, CONTEXT/AGENTS invariant on one write (the move is the fixed-order exception, ADR 0051), INSTALL.md if it lists board commands.
6. Boards this task changes (for the parent to draw, .archboard/vault untouched): Board persistence (a Move node on move.ts, using Write under lease, Board lease, Former names, Vault checkouts, Atomic file replacement), Archboard server routes (a Move route node, using Semantic board store and Vault requirement), Command interface (a Move command node on semantic-move.ts using Board client).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (TASK-472.15):
- The store operation is moveSemanticBoard (src/runtime/semantic-board-store/lib/move.ts, with move-checks.ts and move-drill-downs.ts). It takes the board's name lease in the target vault first (async, admitted as write.ts admits), then the source board's lease through underBoardLease, and does all the work in one synchronous pass inside both: checks, target note, rewrites, source unlink. Inside a pass nothing can wait, so each board whose drill-down is rewritten is taken with withBoardLockIfFreeSync; when somebody else holds one the move answers MOVE_STOPPED (exit 5) with the board in both vaults.
- Running the move again finishes it: a target board with the moved board's id is the earlier half of the same move and is overwritten from the source; a drill-down the first run rewrote no longer opens a board of the source vault, so it is skipped.
- Every variant's drill-downs are rewritten, frozen history included, because a link on a historical variant would otherwise open nothing (ADR 0051: rewritten wherever the move changes what it means). A self-link on the moved board stays as it is.
- BOARD_EXISTS covers the board's name and each of its former names against every name and former name in the target (ADR 0036: a former name is not free).
- The target note is the source board through acceptedBoard(source, candidate): its version advances by one and the target vault's vocabulary is checked only for kinds new against the source (none).
- --expect-version is optional and checked when given, as for discard. The move does not refuse a target checkout that is not the chosen one of its identity: ADR 0051 moves into the vault found from --to, and drill-downs then resolve to the chosen checkout.
- --to is found as -C finds a vault (findVaultOf in command-routing), and a holder the registry does not know is registered; the answer says so in to.registered.
- The route announces board_note for the target and for each rewritten board, board_note discarded in the source vault, and the doing line in both. It releases this writer's claim on the source board, as discard does; the claim is not carried to the target.
- The move contract (BoardMoveInputSchema, MoveEndSchema, MovedDrillDownSchema, BoardMoveAnswerSchema) is in src/shared/semantic-board/lib/move.ts, so the store, the route and the client read one shape.

Decision (2026-10-15): --to finds the target vault as -C finds one, so a move into a worktree's checkout lands in that worktree's vault, with the code of its branch, and the rewritten drill-downs resolve in the chosen checkout as any board of a worktree does. ADR 0051's 'the vault of the chosen checkout' is the browser form, which names a repository. Review: --expect-version is now required, as the help and every sibling write command say (885eff3cf, 3219195b8), which replaces the earlier note that it is optional. Links in the target vault into the moved board are rewritten too (225e493f0).

Board proposals (TASK-472.15), drawn in deadb8e33 and adopted in 8d868ff9f:
- Board persistence@TASK-472.15, adopted at v49. Adds Move (function in Board store, bound to lib/move.ts; its description names move-checks.ts and move-drill-downs.ts). Anchored calls: Archboard server -> Move (moveSemanticBoard); Move -> Board lease twice (holdBoard: the source's lease, then the target's without waiting; withBoardLockIfFreeSync: each relinked board), Write under lease (boardBefore), Former names (resolveSemanticBoard), Vault checkouts (vaultIdentity), Place the file (writeBoardFile), Atomic file replacement (unlinkDurably), Address and locate (locateSemanticBoard), Vault configuration (readSemanticBoardConfiguration). Summary is now the board's scope, including a board's move to another vault.
- Archboard server routes@TASK-472.15, adopted at v39. Adds Move route (bound to semantic-board-move.ts). Anchored edges: Agent CLI -http-> Move route (moveRoute); Board routes mounts it (moveRoute); Move route -> Semantic board store (moveSemanticBoard), Board write routes (answerRefusal), Vault requirement (namedVault, for move.to), Live panes (broadcast event: every board written and where the board went; movePaneVault; announceDoing), Repository listing (repositoryOfVault).
- Command interface@TASK-472.15, adopted at v73. Adds Move (module in Commands, bound to semantic-move.ts). Edges: Contract execution -> Move (handler); Move -> Board client (moveSemanticBoardOnServer); Move -> Command routing (findVaultOf).
- Command dispatch@TASK-472.15, adopted at v29. This board was not in the plan. The code check gave a CALLER_UNDRAWN warning on Addressed vault: semantic-move.ts:216 calls findVaultOf from outside command-routing. The proposal adds Move command (bound to semantic-move.ts) with an anchored call -> Addressed vault (findVaultOf).
- Live panes@TASK-472.15, adopted at v32. This board was not in the plan. It draws the pane moves of rename and of a cross-repository show, so the proposal adds one edge: Archboard server -> Pane vaults, "a moved board takes its panes to the target vault" (semantic-board-move.ts#movePaneVault).
semantic compare on each proposal reported exactly these added parts and relationships and nothing else. Interface changes: Board store gained the entry point Move; Commands gained Move; on Command dispatch, Addressed vault became an entry point of Command routing, with the caller Move command.

check --code comparison, run without --variant and then with --variant TASK-472.15: no '>' lines. The first draw introduced two RELATIONSHIP_UNDRAWN warnings (Move reaches Address and locate, and Vault configuration); both are now drawn. Six '<' lines are cleared: Board persistence RELATIONSHIP_UNDRAWN for Board store reaching Board lease, Atomic file replacement and Vault checkouts, and for Archboard server reaching Board store; Command interface RELATIONSHIP_UNDRAWN for Commands reaching Command routing; Command dispatch CALLER_UNDRAWN on Addressed vault. Findings in both runs that touch this task's parts, left as they are:
- EXPOSED_UNUSED (information) names SemanticMoveCommand on Board store, as it names SemanticDiscardCommand; nothing outside the store uses either. On Commands it names semanticMoveContract and sayingWhatWasRewritten (used by run.ts and the command's test, both inside the module). These are code and outside this drawing work.
- Command dispatch RELATIONSHIP_UNDRAWN (Server client reaches Checkout registry, server-client.ts:161) and ANCHOR_SYMBOL_MISSING on routes 57KDyakx and yqfoZW5w and on Live panes 6o2ZXOzG (pane-show-route.ts repositoryOfVault, repository-routes.ts declareDirectory) come from 13c87172f (TASK-472.14). Its proposals settle them.

Footprint base: 934c827a3, the parent of the first TASK-472.15 code commit 66966c190, found through the Refs trailer. On each proposal, current was the proposal's parent. namedAndChanged: Move, Write under lease (Board persistence); Move route, Board routes (routes); Move, Board client (Command interface); Move command, Addressed vault (Command dispatch); Pane vaults (Live panes). changedNotNamed, settled:
- Board store (directory container): the changes the proposal does not name inside it are move-checks.ts and move-drill-downs.ts (Move's helpers, described on Move), accepted/outcome/index exports and refusal codes, and tests/move.test.ts (66966c190, 08fea3d25, 7dc2810c6, b45225d65, 89d199286, 5fc7f512c, 225e493f0). Their callers are drawn on Move, so they are internal to the store.
- Command catalogue (run.ts, 08fea3d25): registers the move contract. The drawn edge "a contract per command" already covers it.
- Commands (directory container): only semantic-move.ts (named as Move) and its test.
- Server client (2692c760c): a refusal error keeps the server's whole answer, so the CLI can list the drill-downs a stopped move rewrote. This is internal.
- Command routing (directory container, Command dispatch): index.ts re-exports findVaultOf. Addressed vault is named.
- Vault finder (c6243ad33): the refusal names the option (--to or -C) that found no vault. This is internal.
- Change feed (Live panes, e3347b4a1): a moved board's board_note carries movedTo, and the feed's line says where the board went. Its responsibility (every settled board change, filed under its vault) still holds, so this is internal.
- Not this task's (other tasks' commits in the range): Repository routes, Checkout registry, Pane routes, Vault requirement, Pane session and Repository list (Live panes and routes), and Panes, Repositories and Command contract (Command interface) belong to TASK-472.14 (13c87172f, f124a78d2). Entry point and Source checkout belong to TASK-472.08 (37ae63e73, 098d3e983). TASK-472.14's later proposals settle the first group.
namedNotChanged: only parts that a new relationship names (Atomic file replacement, Former names, Place the file, Board lease, Vault checkouts, Board write routes, Contract execution). That is normal. Skipped: drill-down parts only. The Command routing drill-down on Command interface opens Command dispatch, which has its own proposal (read above).

archboard check after adoption: exit 0, no diagnostics.
behind (archboard check --code after adoption): all five adopted boards read 0 commits. Two other boards are behind on this task's commits:
- Archboard server: part "Archboard server" (src/server/archboard) through e3347b4a1, 885eff3cf, ca2e793a7 and 08fea3d25. This board draws the route handlers as one card that opens Archboard server routes, which now draws the Move route. Its only finding in this run is the module-wide EXPOSED_UNUSED from before, so it is still right.
- Skill evaluation: part Evaluation inputs (evals) through 614ba2bed, which adds a coverage entry for semantic move to evals/coverage.json. This is data and changes nothing the board draws, so it is still right.

Correction to the Board store line above: within the store, outside move*.ts, this task changed only index.ts (exports), lib/outcome.ts (refusal codes) and lib/write.ts (Write under lease, named). accepted.ts did not change.

Decision revised (2026-10-15, from the TASK-472.14 boundary review): a finished move chooses its target checkout when it is a known checkout that is not chosen, as an agent's browser show does, and says so in chose; otherwise a later registry change would move the board's panes to the chosen checkout's vault, which lacks the board. This brings the CLI form in line with ADR 0051's 'the vault of the chosen checkout'.

Boards for 197f68f39 (a finished move chooses its target checkout through chooseShownCheckout, exported from pane-show-route.ts, and then calls followRegistry): the TASK-472.14 proposal on Archboard server routes draws them, and it was adopted at version 42. It adds Move route -> Live panes (a finished move chooses its target's checkout, anchored at semantic-board-move.ts chooseShownCheckout) and Move route -> Repository routes (every pane follows the choice, anchored at followRegistry). This clears that board's RELATIONSHIP_UNDRAWN Move route -> Repository routes. On Live panes, the move stays drawn through the Archboard server container, as 55zluwBL draws it.
<!-- SECTION:NOTES:END -->
