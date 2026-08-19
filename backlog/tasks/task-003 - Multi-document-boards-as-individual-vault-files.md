---
id: TASK-003
title: 'Multi-document: boards as individual vault files'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 13:55'
updated_date: '2026-08-19 16:01'
labels:
  - needs-triage
dependencies:
  - TASK-002
ordinal: 3000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board can be loaded and saved by name, not one global canvas
- [ ] #2 The element store and WebSocket protocol carry a board key
- [ ] #3 Board identity (board, variant, level) lives in frontmatter and round-trips
- [ ] #4 Until TASK-010 lands, saving is last-writer-wins and that is documented, not silent
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vault + board addressing. New src/core/board.ts: BoardIdentity {board, variant, level?}, name/variant validation, boardKey() = name for variant 'current' else 'name@variant', vaultPathFor() -> <vault>/<name>[@<variant>].excalidraw.md (subdirectories allowed, traversal refused), listBoards() walking the vault for *.excalidraw.md and reading identity from frontmatter. Vault root from ARCHBOARD_VAULT via src/core/config.ts (dotenv already loaded there); no default — board commands fail with an actionable message naming the env var.
2. Frontmatter identity. Extend obsidian-md.ts (which owns the line-based verbatim frontmatter format) with an idempotent key upsert: identical value -> line untouched (keeps two exports byte-identical), different value -> that line replaced in place, absent -> appended after the last non-blank line like REQUIRED_FRONTMATTER. Keys are namespaced flat: archboard-board / archboard-variant / archboard-level, following ADR 0003's reason for namespacing (the plugin and other vault plugins own the same key space) while staying line-updatable. wrapSceneAsObsidianMd gains an options arg carrying those entries.
3. Board-keyed store. src/types.ts: replace the single global elements Map with a boards registry Map<BoardKey, BoardState{identity, elements, vaultBacked, savedAt}> plus an active-board pointer. Boot state is a non-vault-backed scratch board so every existing single-canvas caller keeps working unchanged. Snapshots and selection stay canvas-scoped (one canvas, one selection); switching boards clears the selection.
4. REST. Element routes resolve a board from ?board= and default to the active board. New /api/boards (list), /api/boards/current, /api/boards/open, /api/boards/new, /api/boards/save. The server does the vault file I/O because it owns the store; save reuses expandElementsForExport({deterministic:true}) + wrapSceneAsObsidianMd, the same path export --format obsidian uses, so idempotency and losslessness are structurally the same code.
5. WebSocket protocol. Every broadcast carries a board key; new board_switched message carrying the new board's identity and full element set; frontend tracks the board it is displaying, ignores messages for other boards, cancels any pending autosync on a switch, and posts /api/elements/sync?board=<key> so an in-flight sync cannot land in the wrong board.
6. CLI: archboard board list|new|open|save|current, plus MCP tools list_boards/open_board/save_board.
7. Last-writer-wins (AC #4, TASK-010 out of scope): stated in board save command help, printed as a stderr note on every save that overwrites an existing vault file, and documented in CLAUDE.md and the excalidraw skill. No hashing, locking or watching.
8. Verify behaviourally: build, create a board, add nodes, save, open a second board, confirm the canvas swapped, reopen the first and confirm elements + identity returned, confirm custom frontmatter survived, re-run the idempotency (two saves byte-identical) and losslessness (open then save byte-identical) checks, drive Chrome to confirm the frontend follows a switch, and run bun run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation landed (pre-verification): board-keyed store in src/core/board-store.ts (scratch board at boot so pre-board callers are unchanged), addressing/vault I/O in src/core/board.ts, idempotent frontmatter upsert in obsidian-md.ts, /api/boards {list,current,open,new,save} + ?board= on every element route, board key on every WebSocket broadcast plus a new board_switched message, board-aware frontend, `archboard board` CLI, and list/open/new/save_board MCP tools. Frontmatter keys are plain board/variant/level (Obsidian properties are the note author's space, unlike customData which the plugin writes into). Vault root is ARCHBOARD_VAULT with no default.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:24
---
TWO-WRITER DECISION — needs a human call before implementation.

archboard holds the canvas in memory; the Obsidian Excalidraw plugin holds scene state in memory when a board is open. Neither knows about the other, so last-writer-wins silently eats edits. Note this is not hypothetical: the plugin has a known class of data-loss issues where Obsidian Sync overwrites in-progress Excalidraw edits (zsviczian/obsidian-excalidraw-plugin#1189), with autosave repeatedly implicated. A synced vault is effectively a third writer.

A. Convention only. archboard owns a board while it is open; Obsidian is for reading and prose. Documented, not enforced. Cheapest, and silently loses work when someone forgets.

B. File-watch and reload. archboard watches the board file and reloads on external change. Excalidraw scenes do not merge meaningfully, so this discards whatever the canvas had — trades one silent loss for another.

C. Optimistic concurrency. Record the file hash at load; verify it before every write; refuse and report on mismatch. Prevents nothing, detects everything, never loses data silently. Needs a conflict path (reload / overwrite / save-as).

RECOMMENDATION: C as the mechanism plus A as the documented convention. The hash check is a few lines and turns the failure mode from silent data loss into a visible refusal, which is the only acceptable behaviour for boards a human has hand-arranged. B is a trap.

Not implementing until confirmed.
---
<!-- COMMENTS:END -->
