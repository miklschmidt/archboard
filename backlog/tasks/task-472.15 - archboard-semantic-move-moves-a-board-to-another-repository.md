---
id: TASK-472.15
title: archboard semantic move moves a board to another repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-15 05:24'
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
<!-- SECTION:NOTES:END -->
