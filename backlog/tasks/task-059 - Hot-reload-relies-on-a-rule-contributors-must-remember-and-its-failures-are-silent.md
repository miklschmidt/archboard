---
id: TASK-059
title: >-
  Hot reload relies on a rule contributors must remember, and its failures are
  silent
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 18:42'
updated_date: '2026-08-20 19:11'
labels: []
dependencies: []
references:
  - src/core/hot.ts
  - scripts/check-hot-reload.mjs
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
  - src/core/board-store.ts
priority: high
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Raised by the user on reviewing TASK-057, and they are right.

TASK-057 added `bun --hot` for the canvas server, with long-lived state parked behind `kept()` in src/core/hot.ts. Building it turned up two bugs that existed only because of the reload, neither visible from the design:

- Re-evaluating board-store.ts re-ran `boards.set(SCRATCH_KEY, ...)` and blanked the scratch board under an open pane.
- A connection handler added rather than replaced answered every message twice.

Both were found by reloading a live server and looking. That is the whole problem: the safety of a reload rests on every module obeying two conventions, and nothing enforces either.

WHY THIS IS WORSE THAN AN ORDINARY INVARIANT

`bun --hot` re-evaluates the ENTIRE module graph, not the changed file. The board-store bug reproduced when only server.ts was edited. So every module with an evaluation-time side effect is a hazard on every reload, and the blast radius grows with the codebase rather than staying where the reload happened.

The failure mode is silent corruption of a live canvas somebody is drawing on. Not a crash, not a wrong answer, but a board quietly emptied or an event delivered twice. This session spent its whole length removing exactly this shape of bug: three shallow copies that were fine "because every writer replaces objects rather than mutating them", a bound label that drifted because nothing kept it with its container, a diff baseline that shared memory with the board it was diffing. Every one held only while someone remembered a rule. Shipping a new rule of the same kind is the mistake with a fresh coat of paint.

WHAT TO DO

The value is real: developing the canvas without losing the boards and panes a human arranged. Keep it only if the discipline can be enforced rather than remembered. Two mechanisms, and hot reload should stay only if both land:

1. A static check over src/ that fails when a module creates long-lived state at evaluation time outside `kept()`. The shapes to catch are module-scope mutable containers (a `new Map()`, `new Set()`, an array or object literal that gets written to), `new EventEmitter()`, timers, listener registration, and anything binding a port or a signal handler. A heuristic that errs toward false positives with an explicit opt-out marker is better than one that misses.

2. A canary that runs on every reload in dev mode and makes a broken reload loud. After re-evaluation, assert what must not have changed: every open board still has its element count, pane registrations still hold their boards, the socket count is unchanged, and the change feed's id and cursor are the same. Anything that moved gets reported to the terminal and to connected tabs. This catches whatever the static check does not, which is the point, because the static check will not catch everything.

IF NEITHER CAN BE MADE TO WORK, REMOVE HOT RELOAD. Most of TASK-057's value was dropping the build step, and that stands on its own: there is one source of truth now, and restarting is a second. `--hot` is a convenience on top, and a convenience that can silently eat a human's unsaved board is not worth keeping on trust.

Also worth deciding: `bun --hot` reloads on a file save, which is not a moment anyone chooses deliberately. If reloading were asked for rather than triggered by a keystroke, the risk would drop a long way even before the checks above. Say whether that is possible with bun, and if it is, prefer it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check fails when a module creates long-lived state at evaluation time outside kept()
- [x] #2 The check catches both bugs TASK-057 found, shown by reintroducing them
- [x] #3 A reload that breaks board, pane, socket or change feed identity is reported loudly rather than silently accepted
- [x] #4 The canary is proved by breaking a reload on purpose
- [x] #5 Whether a reload can be asked for rather than triggered by a file save is answered, and the safer option taken if it exists
- [ ] #6 If neither the check nor the canary can be made reliable, hot reload is removed and ADR 0014 records why
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ANSWER THE TRIGGERING QUESTION FIRST. Proven by experiment on bun 1.3.14: bun --hot re-evaluates the entire graph on any save, and utimes alone does not trigger it. But a gated entry does work: a tiny entry run under --hot re-imports the app only when a reload token changes, so ordinary file saves re-run the entry and nothing else. Take it. New src/dev-canvas.ts is the --hot entry; a reload token file in the state dir is the trigger; 'canvas reload' asks for one. dev:canvas points at the new entry.
2. STATIC CHECK: scripts/check-module-scope.mjs, scoped to the static import graph of src/server.ts, using the typescript parser. Rules: new at module scope (containers nobody writes to are exempt as lookup tables), mutable literal at module scope, timers, listener added without a paired removal or once-flag, bind/listen without a once-flag, and a write to long-lived state (an import, or a kept()-bound const) without a presence guard. Waiver marker '// hot-safe: <reason>' with a required reason.
3. FIX WHAT IT FINDS: winston built a second Console and File transport on every reload, leaking a log file handle each time. Wrap the logger in kept().
4. SELF-TEST so the proof does not rot: fixtures reproducing both TASK-057 bugs, asserted by the check under --self-test.
5. CANARY: src/core/reload-canary.ts reads the kept registry by name (not by importing app modules, whose bindings differ across the reload boundary) and snapshots board element counts, pane-to-board registrations, socket count, and change feed id and cursor. dev-canvas takes a snapshot before the re-import and compares after, reporting anything that moved to the terminal and to connected tabs.
6. EXTEND scripts/check-hot-reload.mjs: an ordinary file save changes nothing, an asked-for reload runs new code and keeps everything, and the canary fires on a reload broken on purpose.
7. DOCS: ADR 0014 and CLAUDE.md. Separate hazards that exist only because the server holds unsaved board state from those that exist regardless of where board content lives.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
COMMIT 0326b32.

AC5 ANSWERED FIRST, AND IT CHANGED THE REST. A reload can be asked for. Measured on bun 1.3.14, none of it documented:
- bun --hot re-evaluates the ENTIRE graph on any watched file change, confirmed: editing a leaf module re-ran a module that did not import it.
- fs.utimes on a watched file triggers nothing; bun wants new bytes.
- A query-busted dynamic import WITHOUT --hot re-reads only that one module. Its own imports stay cached at the old version, so it cannot reload a graph. This is why --hot is still needed.
- A dynamically imported, runtime-computed, out-of-tree absolute path IS watched.
Put together: bun re-evaluates the ENTRY by itself, and the entry can be almost empty. src/dev-canvas.ts re-imports the canvas only when a reload token's generation moves, so an ordinary save re-runs about ten statements and stops. archboard reload moves the token via POST /api/reload. Token lives in the state dir keyed by port, so the repo stays clean and two canvases cannot reload each other. /health reports reloadable; a canvas from archboard start refuses with 409 and says how to get one.

AC1/AC2. scripts/check-module-scope.mjs, over the static import graph of src/dev-canvas.ts and src/server.ts (35 modules). Rules: new-at-module-scope (a container nobody writes to is exempt as a lookup table), mutable-literal-at-module-scope, timer, listener added without a paired removal or once-flag, bind, and a write to long-lived state (an import, or a kept()-bound const) with no presence guard. Waiver: // hot-safe: <reason>, reason required.
Reintroducing both TASK-057 bugs into the committed source:
  FAIL src/core/board-store.ts:75 [mutation-at-module-scope] boards.set(...) writes to long-lived state ... Guard it (if (!boards.has(...))).
  FAIL src/server.ts:333 [listener-at-module-scope] wss.on('connection') adds a handler on every reload ... Remove the old one first.
exit 1, then exit 0 after restoring. Both are also permanent fixtures under scripts/fixtures/module-scope/, asserted by --self-test, alongside reload-safe.ts which must produce zero findings so a check that failed everything could not pass.

FOUND A REAL BUG ON FIRST RUN. src/utils/logger.ts built winston Console and File transports at module scope, so every reload opened another write stream on the same log file while modules holding the old logger kept writing to it. One leaked file descriptor per reload, silent. Fixed by wrapping the logger in kept().

AC3/AC4. src/core/reload-canary.ts reads the kept registry BY NAME rather than importing the modules that own the state, because it lives on the dev entry's side of the reload boundary and an import there would bind to whichever copy was current. It compares board element counts, pane-to-board registrations, socket count, and feed id and cursor (cursor may move forward only). A complaint goes to the terminal AND to every open tab as reload_broken, because the developer and the person standing at the board are two different people.
Broken on purpose under a live canvas with two elements and a registered pane, by removing the board store's presence guard and then asking for a reload:
    !! THE RELOAD BROKE SOMETHING. The canvas is not what it was.
       - board "scratch" went from 3 elements to 0
       Restart the canvas before trusting anything on it.
and the connected socket received reload_broken. That is now the last section of scripts/check-hot-reload.mjs.

WHAT THE STATIC CHECK CANNOT SEE, documented at the bottom of the script. No type information, so receivers are matched by bare name: two different boards in two files are one name, and state reached through a property (state.boards.set(...)) is not matched. It takes a removeAllListeners in the same module as evidence of replacement without checking order or receiver identity. State created inside a function called from module scope is invisible, as is anything behind a dynamic import, which it does not follow. That is exactly why the canary exists.

HAZARD CLASSES, kept apart because a stateless-server design is under discussion.
Only because the server holds unsaved board state: a reload that drops or blanks a board. A stateless server makes that recoverable and shrinks this half to an annoyance.
Regardless of where board content lives: a doubled connection handler, a rebound port, a listener or timer registered again per reload, a socket dropped while the tab still thinks it is connected, a log file handle reopened per reload. These are session state and handler identity, not board content, and a stateless server leaves every one untouched. The second list justifies enforcement on its own, so the verdict does not depend on the server keeping unsaved state.

VERIFICATION. bun run test exit 0, 440 assertions across 15 suites (was 427 across 14). scripts/check-hot-reload.mjs rewritten for the new model: 31 checks including that three real source saves reload nothing and leave the board untouched, that an asked-for reload runs genuinely new source (proved by a route appended to server.ts that only exists after re-evaluation), that a pre-reload socket hears a post-reload broadcast exactly once (which is what a doubled handler would fail), and that archboard start reports reloadable false and refuses.

NOTE FOR THE NEXT PERSON: the new reload check restores edited files from copies taken at the top, never with git checkout. An earlier throwaway script of mine used git checkout -- and silently reverted uncommitted work in this worktree.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hot reload stays, and it is now enforced rather than remembered.

The triggering question was answered first and it changed the design. A reload CAN be asked for on bun 1.3.14. bun --hot re-evaluates only the entry point by itself, so the entry became src/dev-canvas.ts, a file that re-imports the canvas only when a reload token's generation moves. An ordinary file save now re-runs about ten statements and touches nothing; 'archboard reload' is what reloads. A canvas from 'archboard start' has no token and refuses with a 409.

On top of that, two mechanisms. scripts/check-module-scope.mjs parses the canvas's 35-module import graph and refuses module-scope state, with '// hot-safe: <reason>' as the only way out. src/core/reload-canary.ts compares board element counts, pane registrations, socket count and the change feed's id and cursor across every reload and shouts to the terminal and to every open tab if anything moved.

Verified by breaking things on purpose. Reintroducing both TASK-057 bugs into the committed source makes the static check fail with the exact fix named, and both are permanent fixtures asserted by --self-test alongside a reload-safe fixture that must stay green. Removing the board store's presence guard under a live canvas and asking for a reload produced 'board "scratch" went from 3 elements to 0' on the terminal and reload_broken on the connected socket. bun run test is green at 440 assertions across 15 suites.

The check found a real bug on its first run: winston rebuilt its File transport at module scope, leaking a log file handle on every reload. Fixed with kept().

AC6 did not fire and is left unchecked: both mechanisms were made reliable, so nothing was removed. ADR 0014 records the verdict either way, and separates hazards that exist only because the server holds unsaved boards from those that exist regardless of where board content lives. The second list is the durable one and justifies the enforcement on its own.
<!-- SECTION:FINAL_SUMMARY:END -->
