---
id: TASK-368.04
title: Board persistence draws the semantic board store as a container
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:32'
labels:
  - interfaces
  - architecture
dependencies:
  - TASK-368.02
  - TASK-368.03
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: docs
ordinal: 640000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board persistence is the measured example: Archboard server calls eight of the store's private files, two parts of the engine module look like the rest, and nothing says where the store ends. It is the first board the new rule redraws, through a proposal adopted by this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A proposal on Board persistence draws the store as a container, with the engine parts outside it, and is adopted
- [ ] #2 `semantic inspect` on the container reports the entry points that the code's `index.ts` exposes and callers use, or the task notes explain each difference
- [ ] #3 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected board: Board persistence (module level). No other board changes: the Archboard server board and the flat module boards belong to TASK-368.05.

1. Read Board persistence (current variant TASK-332, version 18) through ./bin/dogfood: semantic show, a rasterized picture.
2. Claim the board and branch the proposal Board persistence@TASK-368.04 from the current variant.
3. On the proposal, add one container node, Board store (kind module), bound to src/runtime/semantic-board-store, and parent every part bound under src/runtime/semantic-board-store/lib to it. Atomic file replacement (engine/atomic-write.ts) and Board lease (engine/board-lock.ts) stay outside, as do Archboard server. Every id is kept; nodes are restated whole with their parent.
4. The server's existing calls already land on the parts whose lib file implements the name index.ts re-exports (semanticBoardAddress/locateSemanticBoard, listSemanticBoards, readSemanticBoard, the *Transition functions, renameTransition, writeSemanticBoard, discardSemanticBoard, checkSemanticVault), so they stay as they are and become the container's entry points. The parts no outside file calls become hidden parts.
5. Add the one entry point index.ts exposes and the server calls that the board lacks: Vault configuration (lib/configuration.ts, readSemanticBoardConfiguration, called at semantic-board-routes.ts:90 and :308), with the store's own reads of it from read.ts and write.ts.
6. Give Adopt back its binding to lib/adopt.ts (it implements adoptVariant; the binding was lost on TASK-331).
7. semantic inspect --container Board store on the proposal; set its entry points against the index.ts exports that callers outside the store use; record each difference in the notes.
8. semantic compare, rasterize the proposal and look at it; give the proposal the board's scope as its summary; adopt with --expect-version; ./bin/dogfood check reports no diagnostics.
9. Commit the vault file and this task file by path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal Board persistence@TASK-368.04 (branched from TASK-332 at version 18, edited at version 20).

What it draws: a new container Board store (module), bound to src/runtime/semantic-board-store. All 18 parts bound under its lib/ get it as their parent. Every id is kept. Archboard server stays outside as the one caller. The two engine parts stay outside as the targets of the store's outgoing calls: Board lease (engine/board-lock.ts) and Atomic file replacement (engine/atomic-write.ts). They keep their writes group, so the picture draws them in a Board writes region of their own, outside the container.

Added with evidence:
- Vault configuration (function, lib/configuration.ts): the one name index.ts exports that the server calls and the board lacked.
- Archboard server -> Vault configuration, call "read the vocabulary": readSemanticBoardConfiguration at src/server/archboard/lib/semantic-board-routes.ts:90 and :308.
- Read and validate -> Vault configuration, call "the vocabulary a read checks" (muted): the configured default of readSemanticBoardAt at lib/read.ts:253.
- Write under lease -> Vault configuration, call "refuse a new unknown key": lib/write.ts:446, then newVocabularyProblem.
- Adopt is bound again to lib/adopt.ts, which implements adoptVariant (transitions.ts:375 calls it). It had that binding on Current architecture and lost it on TASK-331.

No relationship moved. Each existing call from the server already landed on the part whose lib file implements the name it calls through index.ts. So those parts became entry points, bound to the file that runs, and no edge needed restating.

semantic inspect --container "Board store" --variant TASK-368.04: 9 entry points, 10 hidden parts, 1 caller (Archboard server), 7 outgoing relationships, 0 pass-through entry points.
- Entry points: Address and locate, List boards, Read and validate, Lifecycle transitions, Write under lease, Vault diagnostics, Rename, Discard, Vault configuration.
- Hidden parts: Edit semantic content, Propagate descendant edits, Settle disagreements, Drill-down checks, Replaced relationships, Adopt, Shelve, Former names, Place the file, Binding checks.

Held against what index.ts exports and what code outside the store calls (production src/ and scripts/; tests left out):
- Matches. Address and locate = semanticBoardAddress (semantic-write-requests.ts, semantic-board-context.ts) and locateSemanticBoard (semantic-disk-watch.ts). List boards = listSemanticBoards. Read and validate = readSemanticBoard. Lifecycle transitions = create/edit/branch/settle/adopt/shelveVariantTransition (semantic-board-writes.ts). Write under lease = writeSemanticBoard. Vault diagnostics = checkSemanticVault (semantic-board-routes.ts:349). Rename = renameTransition (semantic-board-rename.ts). Discard = discardSemanticBoard (semantic-board-discard.ts). Vault configuration = readSemanticBoardConfiguration.
- Difference 1: callers that exist but are not drawn. Each one reaches an entry point the board already draws, so the set of entry points is the same and only the caller list is shorter. This is scope: the board answers how the running server reads and writes a board.
  - The engine's board-catalogue.ts calls listSemanticBoards. It runs inside the server for the workbench session bindings.
  - The CLI calls initializeSemanticBoardConfiguration (repo-setup-block.ts) and reads SemanticBoardConfigurationSchema (vault.ts).
  - skill-distribution reads SemanticBoardConfigurationSchema (schemas.ts) to generate the JSON Schema.
  - skill-evaluation reads FIRST_VARIANT_NAME (landings.ts). That is a constant of transitions.ts.
  - The scripts build-pipeline-example.ts and engine-gallery.ts call readSemanticBoardAt and the transitions directly.
  - code-opener/lib/routes.ts calls readSemanticBoard. It is server code outside src/server/archboard, which the server card binds.
- Difference 2: exported names that no file outside the store uses. Each lives in a part that is an entry point for another export or a hidden part, so the board draws no call for it:
  - Values: resolveSemanticBoard (Former names, hidden), unsettledAncestor (Propagate descendant edits, hidden), SEMANTIC_BOARD_FILE_SUFFIX, SEMANTIC_BOARD_CONFIG_PATH and semanticBoardConfigurationPath.
  - Types: the server imports DescendantOutcome and SemanticWriteResult only as types. A type import is no call, so it is no relationship.
  - TASK-368.10 owns reporting these exposed names.
- Difference 3: Former names, Place the file and Propagate descendant edits are hidden parts. Their files export names, but only the store calls them. ADR 0044 counts relationships, not exports.

Picture: the full proposal draws 5032x1525, against 2566x1758 for the current variant. The container runs as one wide box with the server at its top right. Labels read at native scale. The Durable write boundary view draws the container around its selected parts, with the engine parts outside it. Neither view needed an edit.

Adopted TASK-368.04 at version 24, with the summary 'Module level: the board store, the entry points its callers reach, and the reads, transitions and durable writes behind them. Follow linked subjects for related levels.'. TASK-332 is now historical. semantic inspect on the current variant gives the same 9 entry points and 10 hidden parts. ./bin/dogfood check reports diagnostics: []. Another agent branched the draft TASK-367.04 from TASK-332 at versions 21-22 while this proposal was open. That draft now descends from a historical variant, so its adoption needs the archboard-dev PARENT_SUPERSEDED step. Commit a2f56bbad holds the vault file and this task.
<!-- SECTION:NOTES:END -->
