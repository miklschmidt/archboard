---
id: TASK-109.02
title: >-
  Simplify the server write path: one-caller flags on writeBoard, double clones,
  lost fast paths, a refusal whitelist, copy-paste in the converter
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 19:35'
updated_date: '2026-08-23 20:00'
labels: []
dependencies: []
references:
  - src/core/board-write.ts
  - src/core/apply-element-input.ts
  - src/server.ts
  - src/core/canvas-client.ts
  - src/core/mcp-dispatch.ts
parent_task_id: TASK-109
priority: medium
type: chore
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Server/core half of the simplification pass (see TASK-109). Files: `src/server.ts`, `src/core/board-write.ts`, `src/core/apply-element-input.ts`, `src/core/board-version.ts`, `src/core/board-io.ts`, `src/core/board-lock.ts`, `src/core/board-hold.ts`, `src/core/canvas-client.ts`, `src/core/mcp-dispatch.ts`, `src/core/mcp-tools.ts`, `src/cli/run.ts`, `src/cli/scene-io.ts`, `src/core/scene-document.ts`, `src/core/geometry.ts`, `src/core/expand-elements.ts`, `scripts/check-surface-parity.mjs`. Line numbers as of commit ccc9049.

ALTITUDE
- A1 `board-write.ts:79-94,157,169` + `server.ts:3102-3130`: `persistHeld`, `force`, `saveCommand` (and `target`) are set by one caller, `POST /api/boards/save`, and together mean "this write is the explicit save"; inside the door they are two `if (this is the save)` branches while the other half of the hold ritual (`holdOn`, `moved`, `releaseBoardHold` in `afterPersist`) is hand-rolled in the route. Name it once: a single `save?: { target, force?, … }` option the door acts on at both ends (skip `holdWrite`, release the hold after persist), or a `saveBoard()` entry in board-write.ts wrapping `writeBoard`; `saveCommand` is derivable inside the door from `source.key`/`target.key` (also removes the divergent default at `board-io.ts:622`). (= simplification S24.)
- A5 `server.ts:1582-1607` + `board-write.ts:62-67,84-88`: the one fact "this report is the pane's whole scene" is threaded five ways — `fromScreen`, `deletes: fullReport ? [] : deletes`, `before: clear`, `write: always`, two guards; `ElementMutationPlan.before` and `.write` have exactly this one caller. Let the door take the fact (`wholeScene?: boolean` on `elementMutation` or a `wholeSceneMutation(...)` constructor) and derive the rest; `before`/`write` leave the shared plan type; the two guards stay in the route.
- A2 `canvas-client.ts:40-45,432` + R5 `src/cli/run.ts:441-446`: `BOARD_REFUSAL_CODES` is a client-side whitelist of which server refusals carry the board, and `exitCodeFor` re-lists the same codes; `isBoardRefusal` already checks the structural signature (`document` array, `version`). Recognise a board-carrying refusal by its shape, widen `BoardRefusal.code` to string, and have `exitCodeFor` use one exported set (plus `BOARD_CONFLICT`, whose body differs).
- A3 `canvas-client.ts:299-303`: `syncToCanvas` swallows every error as "canvas unavailable" except board refusals, inverting its own comment; swallow only the connection failure and rethrow everything else.
- A4 `mcp-dispatch.ts:105-107` (8 sites): `contextualError` drops the caller's context on refusals and drops `code`/`conflict`/`open` on everything else — one `withContext(error, what)` that always prefixes and always carries the structured fields (or `cause`).
- A8 `server.ts:945` + `board-write.ts:157`: "a held board writes no note" spelled from `holdOn` in both — a named predicate on `board-hold.ts`.

EFFICIENCY
- E1 `board-write.ts:216-220`: the board is deep-cloned twice per write (`destinationBefore` and `content`), and `copyContent` `structuredClone`s `files` (base64 images) though no mutation writes into a file record; nine of ten callers never read `destinationBefore`. Clone `content` once; pass the read results through for `destinationBefore`; `new Map(content.files)` for files. Use `copyElements` from `board-store.ts:182` for the element half (R6) rather than a second inline clone.
- E3 (regression) `apply-element-input.ts:365-386`: `settleDocument` lost the early bail the old server.ts had (`if (alsoDeleted.length === 0 && changed.length === 0 && repaired.length === 0) return applied`); restore it.
- E4 `board-write.ts:264-278`: `boardFingerprint` re-renders and re-hashes the whole note whenever `persist` returned null — every agent write to a held board; carry the rendered hash with the held copy, or make the fingerprint lazy.
- E8 `board-version.ts:296-300` + `server.ts:899-902`: after a write the note head is re-read from disk to remember the version the write just returned; call `rememberVersion(writer.id, written.version)` from the result in hand, keep the file read for routes with no write result.
- E10 `src/cli/scene-io.ts:17-21`: `getElements()` then `getFiles()` sequentially; `Promise.allSettled`.
- E5/E6 (carried, optional): `apply-element-input.ts:272,312,355` copies the whole board Map per arrow in `resolveArrowBindings` and scans the board per moved id in `rerouteBoundArrows`; `:322,:431,:436` spreads the board and rebuilds `boundTextsByContainer` 2+K times per write. If it fits, look up `writtenById.get(id) ?? board.get(id)` without the copy, build one binding index and one bound-text index per `applyElementInput` call and thread them. Skip with a note if it grows beyond a small change.

REUSE
- R1 `mcp-dispatch.ts:110-139` + `mcp-tools.ts:50-77` + `apply-element-input.ts:34-92`: the element-input schema exists three times; `ElementSchema` is a strict `z.object` that already drifted (`label`/`start`/`end` had to be added so it stopped stripping them) and `mcp-tools.ts` still advertises fewer fields than the dispatcher accepts. Export the schema from `apply-element-input.ts` (or make the MCP side a loose pass-through and let the server refuse) and add field parity to `scripts/check-surface-parity.mjs`. R1b `mcp-dispatch.ts:87-89` duplicates `PointSchema` from `apply-element-input.ts:21-24`.
- R3 `apply-element-input.ts:109-112,257-265`: `normalizePoints` and `pathOf` hand-roll point tuple/object coercion that `geometry.ts:48-61` (`pathOffsets`) owns; export a `pointsOf(points)` from geometry and use it.
- R4 `apply-element-input.ts:185,260` + `expand-elements.ts:450`: the default arrow path `[[0,0],[100,0]]` three times; one exported constant.
- R-minor `mcp-dispatch.ts:52` imports `buildSceneFile, importScene` from `../cli/scene-io.js` — core reaching into cli, the inverse of what TASK-104 fixed; the shared pair belongs in `src/core/scene-document.ts`. `server.ts:1983` `sleep` duplicates `board-lock.ts:958`. `path.includes('?') ? '&' : '?'` 4× in canvas-client.ts (and api.ts/doing.mjs) — one `addQuery`. `board-io.ts:352-353` and `server.ts:670-675` both convert `files` Map→Record; `boardFilesMessage` is the named one.

SIMPLIFICATION
- S3 `board-version.ts:173` `describeVersionConflict` exported, no importer: un-export. S4 `server.ts:46` `openBoardKeys` imported, unused. S5 `board-io.ts:73` `extractSceneJsonFromObsidianMd` imported, unused. S11 `server.ts:111` second import from `./core/board.js` — merge into :83-97.
- S6 `board-write.ts:222,:105`: `mutation.delta ?? emptyDelta()` unreachable because `delta` is required; make it optional so the three hand-written empty deltas (`server.ts:2190,:2227,:3120`) collapse.
- S9 `board-io.ts:629`: `renderContent(..., Array.from(content.elements.values()), ...)` passes the parameter's own default; drop it (or reorder so `existingNote` is third — `board-write.ts:272` is the only other caller).
- S17 `apply-element-input.ts:447-466` vs `:509-520`: the tails of `applyAgentInput` and `applyHumanInput` (delete loop, `settleDocument`, `named` resolution) are identical — each returns `{created, updated, namedIds}` and `applyElementInput` runs the tail once. S18 `:313-314,:327-328,:337-338` (+ :217-218) `updatedAt`/`version` bump four times — one `bumpVersion`. S19 `:124,132,141,158,221,222,239` `Object.prototype.hasOwnProperty.call` seven times — one module-level helper.
- S20 `board-lock.ts:379-381,:445-447,:518-520,:619-620`: `stopRenewing; forgetRememberedVersion; claims().delete` repeated four times — one `dropClaim(board, entry)`.
- S23 `server.ts`: `res.status(boardErrorStatus(error)).json(boardErrorBody(error))` 27 times, 16 with a preceding `logger.error`, 11 without — one `answerBoardError(res, error, what?)` that logs when `what` is given, so the logging decision is visible per site.
- S25 `canvas-client.ts:328` `export type ElementInput = object` forces `as unknown as ServerElement` casts; `Record<string, unknown>`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every finding above is fixed or listed in the notes as skipped with a one-line reason; no behaviour changes; no route hand-rolls part of the write ritual beside `writeBoard`
- [ ] #2 `writeBoard` carries no option whose only legal combination is "the explicit save"; the save ritual (skip holdWrite, release the hold) lives in one place
- [ ] #3 A board-carrying refusal is recognised by its shape on the client; the MCP element schema is the server's or a pass-through, and `test:parity` checks field parity
- [ ] #4 `bun run type-check`, `test:one-write`, `test:lock`, `test:version`, `test:doing`, `test:changes`, `test:boards`, `test:labels`, `test:geometry`, `test:mcp`, `test:parity`, `test:module-scope` pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Simplify the board write entry first: replace the explicit-save flag combination with one save request that skips held writes and releases the hold after persistence; derive whole-scene mutation behavior inside elementMutation; remove the double clone, make destination state lazy/read-only, restore no-op defaults, and reuse held-write and file helpers.\n2. Simplify element conversion: restore settleDocument's early return, share point/default-path/version/property helpers, merge the agent/human common tail, and take only small binding-index improvements that preserve the current converter order.\n3. Consolidate client and MCP refusal handling: recognize board-carrying refusals by shape, export one refusal-code set for exit status, rethrow non-connection sync failures, preserve context and structured error fields, and replace the dispatcher element schema copy with the converter's schema.\n4. Remove the remaining repeated and dead code: one server board-error responder, shared claim cleanup, shared scene import/export ownership, concurrent scene reads, derivable version remembering, unused imports/exports, and redundant render arguments.\n5. Extend surface parity to compare advertised MCP element fields with the converter schema, then run the allowed focused checks. Record a one-line skip reason for any finding not changed.\n6. Commit each coherent finding group with explicit paths, append evidence to TASK-109.02 after each slice, read task-finalization, check acceptance criteria against the allowed validation list, add the final summary, and move the task to Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1 complete (A1, A5, A8, E1, E4, E8, S4, S6, S9, S11): writeBoard now owns the explicit-save ritual through save: { target, force }; elementMutation derives full-scene clearing/deletion/no-op behavior from wholeScene; board writes clone elements once and copy the files Map without cloning image payloads; held writes carry their rendered hash; version remembering uses the write result when available; held-note decisions use writesBoardNote; redundant imports, empty deltas, and render arguments are gone. Evidence: bun run type-check passed; test:one-write passed 70 checks; test:lock passed 119 checks; test:version passed 65 checks.

Slice 2 complete (E3, R3, R4, S17, S18, S19): settleDocument regains its unchanged fast return; geometry owns point normalization and the default linear path; converter version/timestamp bumps and own-property checks each have one helper; agent and human conversion now return prepared writes and applyElementInput runs the shared delete/settle/name tail once. Skipped E5/E6: indexing arrow bindings and bound texts would change the converter's ordering-sensitive repair data flow beyond a small quality-pass edit, while current checks assert only final behavior. Evidence: bun run type-check passed; test:labels passed 182 checks; test:geometry passed 82 checks; test:one-write passed 70 checks.

Slice 3 complete (A2, A3, A4, R1/R1b, S25): board-carrying refusals are recognized by their structured body, while the exported refusal-code set is used only for CLI exit status; syncToCanvas swallows connection failures only; MCP error context now prefixes every error and preserves code/conflict/open/refusal data; create/update/batch MCP validation and advertised JSON schemas derive from apply-element-input; parity checks exact element-field agreement and an unlisted shaped refusal; ElementInput is Record<string, unknown>. Evidence: bun run type-check passed; test:parity passed (41 MCP tools, 50 CLI entries); test:mcp passed 6 checks; test:doing passed 42 checks; test:version passed 65 checks.

Slice 4 complete (E10, R-minor, S3, S5, S20, S23): scene export reads elements/files concurrently with Promise.allSettled; shared scene import/export lives in core/scene-document and the CLI-only module is removed; canvas query construction, board file records, and sleep are shared; describeVersionConflict is internal and dead imports are removed; claim cleanup has one dropClaim; all 27 standard board-error tails use answerBoardError with logging explicit per call. Evidence: bun run type-check passed; test:boards passed; test:lock passed 119 checks; test:mcp passed 6 checks; test:parity passed; test:module-scope passed (52 modules, no unwaived state); test:branch, test:side-by-side, test:hot, and test:changes all passed.
<!-- SECTION:NOTES:END -->
