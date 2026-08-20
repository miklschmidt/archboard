---
id: TASK-077
title: 'Scratch gets a home in the vault, and a canvas with no vault says what it does'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:16'
updated_date: '2026-08-20 22:20'
labels: []
dependencies:
  - TASK-061
references:
  - src/core/board-store.ts
  - src/core/library.ts
  - src/core/board.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0004-obsidian-vault-as-persistence.md
priority: high
type: enhancement
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 8 of docs/design/the-plan.md, and a prerequisite for the task that dismantles the in-memory board store.

THE PROBLEM. The canvas boots holding a `scratch` board so a first run has something in front of it. It is a board like any other except in one way: it is `vaultBacked: false` and has no file, and `src/core/board-store.ts:72-76` seeds it in memory. Under ADR 0015 board content in a process is exactly what is forbidden, so scratch either gets a home or it is the one board the ADR does not cover, and one exception is how a rule stops being a rule.

WHERE. `<vault>/.archboard/scratch.excalidraw.md`, following the precedent already set by the library at `src/core/library.ts:56`: alongside the boards but out of the way, because Obsidian hides dot-directories so the vault's note list stays notes.

WHAT STAYS TRUE. Scratch keeps every property it has now. It is addressed as `--board scratch` like any other board. `board save --board scratch --as <name>` still gives it a home under a real name, and that is still what promotes it from somewhere to put things to a board somebody meant. A pane opened with nothing else on screen still shows it.

THE OPEN QUESTION, AND IT HAS TO BE ANSWERED HERE. `ARCHBOARD_VAULT` is deliberately unset by default, because the vault spans repositories and there is no sensible default (CLAUDE.md, ADR 0004). Today the canvas boots and shows scratch with no vault set, and only board-shaped commands fail, through `requireVaultRoot` at `src/core/board.ts:194`. Under ADR 0015 there is nowhere to put scratch's elements, so a canvas with no vault has nowhere to put anything. Three answers and none is obviously right:

- The canvas refuses to start without a vault. Honest, and it turns a soft first-run experience into a hard error.
- Scratch falls back to the state directory, next to the pidfile. Keeps the first run working, and introduces a second place boards can live.
- Scratch stays in memory as a documented exception. Keeps everything working and puts a hole in ADR 0015 on day one.

Pick one, write it into ADR 0015 or a new ADR, and say what a first-time user sees. Do not leave it to whoever picks up the store work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The scratch board is persisted at <vault>/.archboard/scratch.excalidraw.md and survives a server restart
- [x] #2 Scratch is still addressed as --board scratch, and board save --board scratch --as <name> still gives it a name
- [x] #3 What a canvas with no ARCHBOARD_VAULT does is decided, implemented, and recorded in an ADR
- [x] #4 A first run with no vault set produces a message that says what to do, not a stack trace
- [x] #5 Starting a canvas with no vault refuses and points at the install step that chooses one, rather than explaining what a vault is
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
HALF ONE — scratch gets a home.
1. board.ts: export VAULT_STATE_DIR ('.archboard'), the one hidden-state convention, and have library.ts use it instead of its own LIBRARY_DIR. Add isScratchKey/scratchIdentity. vaultPathFor() resolves the scratch board to <vault>/.archboard/scratch.excalidraw.md.
2. board-store.ts: scratch is seeded like any other board; BoardState.vaultBacked goes, because every board now has a home and the field is constant-true. classifyBoardSave takes the source key and returns 'named' for scratch, so save --as still moves the pane.
3. server.ts: at start, adopt the scratch note if it is there (elements, baseline, loadedAt) and otherwise record where it will go; drop the 'scratch has no home' save refusal so board save --board scratch writes its own note. Emit 'placeholder' on board info/summaries so the shell can still offer Save-as on scratch without hardcoding a name.
4. frontend: BoardBar/Shell read placeholder instead of vaultBacked.

HALF TWO — no vault, no canvas.
5. board.ts: one refusal message, pointing at install-skill.
6. server.ts startServer(): refuse and exit 1 (the server's established failure code) before binding.
7. spawn.ts ensureCanvasRunning(): refuse before spawning, code CANVAS_UNREACHABLE, so the CLI exits 3 rather than waiting 8s on a detached process whose stderr goes nowhere.
8. INSTALL.md/TESTING.md: 'board commands fail on the vault message' becomes 'the canvas will not start'.
9. Checks: give check-local-bind a throwaway vault; add coverage to check-boards (scratch path, restart survival, save --as still 'named') and a no-vault refusal check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED, in two commits.

HALF ONE — f498642, scratch gets a home.

Its note is <vault>/.archboard/scratch.excalidraw.md. `VAULT_STATE_DIR` in src/core/board.ts is now the single name for the vault's hidden directory and src/core/library.ts imports it rather than declaring its own '.archboard', so there is one convention rather than two that happen to match. `vaultPathFor` is the one door every open, save, new and read goes through, so a single branch there gives scratch its address everywhere; it bypasses the case-walk deliberately, because this name is archboard's rather than a human's. `listBoards` already skips dot-directories, so nothing had to be excluded by hand and the note cannot appear among somebody's boards.

`adoptScratchBoard()` (src/server.ts, before listen) reads that note at start when it is there and records the ADR 0006 baseline, so a sketch outlives the process that drew it. Nothing is written at start: the note appears on the first save, which is what `board new` does too. Full write-through for every board is TASK-078, so 'survives a restart' today means survives a save and a restart, which is what the check exercises.

`BoardState.vaultBacked` is gone. Every board has a home now, so it was constant-true. What actually distinguishes scratch is that nobody named it, and that is on the wire as `placeholder` on board info and board summaries. Three consumers moved onto it: `classifyBoardSave` (now takes the source key and returns 'named' for scratch, so `--as <name>` is still a naming and still moves the pane), the shell's Save (still offers the naming dialog on scratch, which is the only place the shell asks for a name), and BoardBar's save state, which loses its unreachable 'not in the vault' branch. The clear dialog's 'never been written to the vault' hint now reads savedAt/loadedAt, which is what that sentence actually means and was already wrong for `board new`.

The save handler's 'the canvas is holding the scratch board, which has no home in the vault' refusal is gone: `board save --board scratch` writes scratch's note.

HALF TWO — b41c365, no vault, no canvas.

One message, `noVaultMessage()` in src/core/config.ts next to ARCHBOARD_VAULT itself, said in three places: startServer() before it binds (stderr as well as the log, because a first run is the run whose LOG_LEVEL nobody set; exit 1, which is what the server already exits when it cannot bind or is beaten to the port), ensureCanvasRunning() before it spawns (exit 3 through the existing CANVAS_UNREACHABLE code), and requireVaultRoot(), which cannot fire in a running canvas any more and stays as the backstop.

The CLI guard is not redundant. The canvas is auto-started detached with stdio ignored, so the server's refusal lands nowhere: without it, `board list` with no vault waits eight seconds and reports 'the auto-started server did not become healthy'. Proven by reverting it.

Exit 3 rather than a new code: the CLI's codes name the outcome for the caller, not the cause, and the outcome is that no canvas is available at that URL. A foreign service on the port — also permanent, also not a canvas that will start — already exits 3.

CHECKS. check-local-bind was the one suite relying on the old behaviour: it spawned canvases with a bare process.env, which passed here only because ARCHBOARD_VAULT happens to be exported on this machine, and would have failed on CI. It now makes its own throwaway vault, and gained the two refusal cases. check-hot-reload needed its board-store fixture text updated for the dropped `vaultBacked` argument. check-boards gained eight scratch checks, on a canvas of their own that is started twice.

REVERT PROOF, per change:
  vaultPathFor's scratch branch      4 checks in check-boards, one of them scratch appearing in board list
  classifyBoardSave                  2 checks (the pane does not follow the naming)
  adoptScratchBoard() at start       3 checks (nothing comes back after a restart)
  the server's vault guard           check-local-bind, which then exits for the loopback guard instead
  the CLI's vault guard              check-local-bind, after an eight-second wait and the wrong message

`bun run test` is green: type-check, CI coverage, module scope and the fifteen suites, run four times over the change and twice more per half in isolation. The user's canvas on :3000 was never touched; every check and every manual probe ran on its own port with its own vault.

ADR 0015 needed no correction. One sentence added to 'A board with no home in the vault' saying where scratch's note is and that `board list` does not offer it, because 'a home like every other board' does not by itself tell a reader that.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 20:28
---
Decided by the user: the canvas refuses to start without a vault. Recorded in ADR 0015 under "A board with no home in the vault", along with the two rejected answers and why.

The reasoning: a canvas somebody can draw on before discovering the drawing was never anywhere is worse than a canvas that will not open yet, and it is worse in the way that costs most, silently and only once there is something to lose.

That closes the open question in this task's description. The remaining work is unchanged for scratch itself, and gains one thing: the refusal is now the first thing a new person sees, so it carries the product. It has to say what a vault is, how to point at one, and that it can be a directory inside the repository they are standing in. A refusal that only says no is a worse first run than the one being replaced.

The rejected answers, for whoever wonders later. Falling back to the state directory keeps the first run soft and makes a second place board content lives, which is the shape ADR 0015 exists to remove, and it asks an unanswerable question about what happens to that board when a vault is finally chosen. Keeping scratch in memory as a documented exception puts a hole in the rule on the day it is written.
---

author: @claude
created: 2026-08-20 20:28
---
Correction. I checked AC #3 when recording the decision above. It asks for the behaviour to be decided, implemented and recorded in an ADR, and only two of the three are true: it is decided and it is in ADR 0015, and nothing has been implemented. Unchecked.

Worth stating because this task is the gate on the store work, and a checked criterion is how somebody concludes a gate has been cleared without reading why.
---

author: @claude
created: 2026-08-20 20:31
---
Correction to my earlier comment, from the user. I wrote that the refusal is the first thing a new person sees and therefore has to carry the whole explanation. That overstates it.

Choosing a vault is already an explicit step of installing archboard into a repository: install-skill asks where the boards should live, creates the directory, and records the path in the repo's own agent doc. When stdin is not a terminal, which is whenever an agent runs it, it takes the offered vault and prints what it chose. So on the ordinary path a vault exists before any canvas starts.

The refusal is a backstop for a canvas started without that step. It should point at the install step rather than teach the concept. AC #5 reworded accordingly.

Note for whoever implements this: INSTALL.md currently says that without a vault the board commands fail on the vault message. Once this lands the canvas will not start at all, so that passage needs updating in the same change rather than before it.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scratch is a board with a note like every other board, at <vault>/.archboard/scratch.excalidraw.md, and the canvas adopts it at start; a canvas with no vault refuses to start and points at `install-skill`, the step that chooses one.

Verified by `bun run test` (green) and by reverting each change and counting: the scratch path branch is worth 4 checks in check-boards, the save classification 2, the adoption at start 3, the server's vault guard and the CLI's one check each in check-local-bind. Manually: a canvas on a throwaway vault, drawn on, saved, killed and restarted, with the drawing still there and the note absent from `board list`; `board save --board scratch --as payments` still answers saveKind 'named'; and the refusal read on both surfaces, exit 1 from the server and exit 3 from the CLI.
<!-- SECTION:FINAL_SUMMARY:END -->
