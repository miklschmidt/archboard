---
id: TASK-010
title: Write-conflict policy for boards shared with Obsidian
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 15:38'
updated_date: '2026-08-19 17:50'
labels:
  - needs-triage
dependencies:
  - TASK-003
ordinal: 10000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A board's hash is recorded at load and verified before every write
- [x] #2 A board changed underneath archboard since load is refused, not overwritten
- [x] #3 The conflict surfaces to the human with the three outcomes: reload, overwrite, save elsewhere
- [x] #4 Archboard never resolves a conflict on the human's behalf
- [x] #5 The single-writer convention is documented alongside the mechanism
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. board.ts: hashBoardBytes() = sha256 hex of the file's raw bytes; readBoardFile reads a Buffer and returns hash alongside raw.
2. board-store.ts: BoardState.baseline = { file, hash, at } — the bytes archboard last saw at that exact path. Set on open (from disk) and on save (from what was written). Absent on a board archboard invented.
3. server.ts POST /api/boards/save: before writing, read the destination. Refuse with 409 + a structured conflict payload when a file exists there whose sha256 is not the board's recorded hash for that path. That one rule covers both the changed-underneath case and the never-read case (board new, or save --as onto an existing note). force:true skips the check. Delete LAST_WRITER_WINS_WARNING.
4. canvas-client: carry the response body + a BOARD_CONFLICT code on thrown errors; saveBoard gains force.
5. CLI board save: --force; on conflict print the actionable message on stderr, the conflict JSON on stdout, exit 5 (new documented code). Rewrite the command help.
6. MCP: save_board gains force; description rewritten to describe the check, the refusal and the three outcomes, and to forbid force unless the human asked. Dispatch relays the conflict payload rather than a bare throw.
7. Frontend: api.ts throws a typed BoardConflictError on 409; new ConflictDialog built on the existing Modal (same safety conventions as ConfirmDialog: Cancel autofocused, destructive control far away) offering Reload / Save as… / Overwrite; Shell routes save failures into it.
8. Docs: replace the last-writer-wins text in CLAUDE.md (Known gaps + Boards), skills/excalidraw-skill/SKILL.md, its cheatsheet, and skills/archboard-dev/SKILL.md with the real behaviour plus the single-writer convention.
9. Verify behaviourally against a scratch vault: conflict refused with the file intact, then each of reload / overwrite / save-as; normal save still works; idempotency and losslessness re-checked; shell Save exercised in Chrome; bun run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Optimistic concurrency per ADR 0006.

MECHANISM
- `hashBoardBytes()` in src/core/board.ts: sha-256 (hex) over the note's raw bytes. Bytes not the decoded string, so a note archboard cannot decode cleanly still compares honestly; content not mtime, because a sync client restamps files it did not change. `readBoardFile` now reads a Buffer, hashes it, and decodes as a separate step.
- `BoardState.baseline = { file, hash, at }` in board-store.ts — the bytes archboard last saw at that exact path, set on open (from disk) and on save (from what was written). Pinned to a path, so a save-as cannot carry a baseline onto a file archboard never read. `baselineForFile(file)` asks every open board and takes the newest claim.
- POST /api/boards/save reads the destination once, for both frontmatter preservation and the check, and refuses with 409 when a file exists there whose hash is not the recorded one. One rule covers both cases: reason 'changed' (we had a baseline, it differs) and reason 'unseen' (never read it — `board new` whose file appeared underneath, or `--as` onto an existing note). `force: true` skips the check; it is the human's overwrite, never archboard's.
- `describeWriteConflict()` builds the structured conflict — file, reason, hashes, lastReadAt, fileModifiedAt, and the three outcomes as runnable commands — plus the rendered message every surface shows.

SURFACES
- CLI: `board save [--force]`. On conflict the message goes to stderr, `{success:false, conflict}` to stdout, exit 5 (new documented code). Successful overwriting saves print the single-writer convention.
- MCP: save_board gains `force`; description rewritten to say the save can be refused, to name the three outcomes, and to forbid force unless the human asked. Dispatch relays the conflict payload rather than a bare throw.
- Shell: api.ts throws a typed BoardConflictError on 409; new ConflictDialog (built on the existing Modal, ConfirmDialog's safety conventions) offers Save as… / Reload the note / Overwrite the note, cheapest first, with Cancel autofocused. All save paths funnel through one `attemptSave`.

DOCS
Last-writer-wins text replaced (not just deleted) in CLAUDE.md (Known gaps entry removed, Boards section rewritten with the outcome table and the single-writer convention), `board` command help, cheatsheet (CLI/MCP/REST rows), skills/excalidraw-skill/SKILL.md, skills/archboard-dev/SKILL.md, and ADR 0004's status note. Skills re-synced.

VERIFIED behaviourally against a scratch vault
- Conflict is real: opened payments, edited the note from the shell, save refused with exit 5 and `sha256sum -c` confirming the file untouched.
- Three outcomes: `--as payments@from-canvas` wrote a new note leaving the original's disk-side edit intact; `board open payments --reload` took the file's copy and the next save succeeded; `board save --force` wrote the canvas over it (frontmatter still carried across) and left a clean baseline behind.
- 'unseen': `board new ledger` with a file dropped at its address before the first save is refused, not clobbered.
- Normal save still succeeds; idempotency (two saves byte-identical) and losslessness (`open --reload` then save byte-identical) re-checked, including on a note archboard did not author.
- MCP save_board over stdio: isError with the full message + conflict JSON; force:true then succeeds.
- Shell in Chrome: Save on a changed note puts up the dialog; Overwrite, Reload and Save as… all exercised and all three did what they say. Canvas cleared, tab closed.
- `bun run type-check` and `bun run test` (5 MCP stdio checks + loopback bind) pass.

PRE-EXISTING, not introduced here: `wrapSceneAsObsidianMd` carries frontmatter across a save but regenerates the note body, so prose a human writes outside the Drawing block does not survive an archboard save. Worth a separate task if boards are meant to hold prose.

Orchestrator verification: with a board open, appended to its note from a plain shell write (exactly the Obsidian case) and the save was refused with exit 5, the file left carrying the outside edit. The message names the path, both timestamps, and the three outcomes as runnable commands rather than prose. Idempotency and losslessness re-checked. bun run test and type-check green.

While verifying, confirmed a pre-existing data-loss path the agent flagged: prose written into a note outside the Drawing block is destroyed by ANY archboard save, not only --force, because the exporter regenerates the note body. Filed as TASK-017 and recorded as a known shortfall on ADR 0004, whose premise it partly contradicts.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:38
---
Split out of TASK-003 so the multi-document work is not blocked on a product decision. The options and my recommendation (optimistic concurrency: hash at load, verify before write, refuse on mismatch) are recorded as a comment on TASK-003. Needs a human call.
---

author: @claude
created: 2026-08-19 16:50
---
APPROVED by the user: optimistic concurrency (hash at load, verify before write, refuse on mismatch) plus the single-writer convention documented. Recorded as ADR 0006. File-watch-and-reload explicitly rejected — it swaps which side silently loses work rather than fixing anything.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Optimistic concurrency per ADR 0006: SHA-256 of the note's raw bytes recorded at load, verified before every write, refusing on mismatch. The baseline is pinned to a path rather than a board, so save-as cannot carry a baseline onto a file archboard never read, and one rule covers both 'changed underneath' and 'never seen'. Refusal is exit 5 on the CLI, 409 on REST, isError on MCP, and a ConflictDialog in the shell offering the three outcomes cheapest-first with the price of each. Verified all three outcomes and both regression properties.
<!-- SECTION:FINAL_SUMMARY:END -->
