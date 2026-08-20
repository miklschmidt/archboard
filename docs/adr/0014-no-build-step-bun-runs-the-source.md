---
status: accepted
---

# No build step: bun runs the source

Upstream is a node and npm project, so it compiled TypeScript into `dist/` and
ran the JavaScript. We kept that after moving to bun, which runs TypeScript
directly. Nobody ever decided to keep it; it was inherited, and it cost us
(ADR 0002).

**The server and the CLI now run from `src/`.** `bin/canvas` execs
`bun src/bin.ts`, the CLI spawns `bun src/server.ts`, an MCP client's config
points at `src/bin.ts`, and every check script imports the `.ts` files. Only the
frontend is built, because a browser cannot be handed TypeScript, and vite
already covers that.

## The compile step was not neutral, it caused bugs

A compiled copy is a second thing that can be stale, and staleness is invisible
by design: everything still runs.

The running canvas server holds whatever `dist/` said when it started. Rebuild,
and it keeps answering with the old behaviour while every command still works.
In one session that produced two commands disagreeing about one board:
`describe` reported the new behaviour, because the CLI computes it in its own
short-lived process from the fresh `dist/`, and `compare` reported the old one,
because it is a server route in a process from before the rebuild. Neither was
wrong on its own terms, and nothing anywhere said "you are looking at two
builds". Earlier in the same session that ambiguity was diagnosed wrongly, and
the wrong diagnosis cost the user a server restart. TASK-056 is the same
mechanism written up as a bug.

Reading the source the process was told to read does not make staleness
impossible. A long-running server still executes the source it read at start,
until it is restarted or reloaded. But it removes one whole layer of it, and it
removes the layer where the two copies had different names and neither was
labelled.

## What it costs

**Type checking is no longer a side effect of running.** Every `test:*` script
used to compile first, so a type error failed the suite without anyone
arranging it. `bun run test` now runs `bun run type-check` as its first step, so
the safety net is explicit rather than incidental. That is the load-bearing part
of this ADR: delete that prefix and type errors ship silently.

**bun is a hard dependency, including for anything that spawns archboard.** An
MCP client config says `command = "bun"`, and a desktop launcher's PATH is
often shorter than a shell's. TESTING.md and INSTALL.md both say to use the
absolute path from `which bun` when that bites.

**Nothing proves the wire works under node any more.** The stdio and loopback
checks spawn `process.execPath`, the bun running them. That is the honest thing
to check, because it is what an MCP client and `canvas start` now spawn, and
node cannot read a `.ts` entry point at all. If archboard ever needs to run
under node, that is a build again and this ADR is the thing to reopen.

## Hot reload is real, and it is still asked for

`bun --hot` and `bun --watch` are not the same thing, and the difference decides
this. `--watch` restarts the process: boards live in memory, so a restart drops
a human's unsaved rearrangement, which is the input this tool exists to collect
and the one thing it cannot recompute. `--hot` re-evaluates the changed modules
inside the running process, so anything reachable from `globalThis` outlives the
reload.

That makes reloading the canvas worth having rather than a hazard to fence off.
`bun run dev:canvas` reloads the server in place: the port stays bound, the
WebSockets stay open, the boards stay open with their unsaved elements on them,
the panes stay registered holding the same boards, and the change feed keeps its
id and its cursor so a hook's saved cursor still means what it meant. A reload
emits no event of its own. `scripts/check-hot-reload.mjs` proves each of those
against a real canvas, with real source edits and a real pane watching.

What triggers that reload changed in TASK-059, and the section after next is
the one to read: a file save no longer causes one.

**What it costs is a rule.** Module scope is still rebuilt, so state that must
survive has to live somewhere a module reload cannot reach. That is
`src/core/hot.ts`: `kept(name, create)` returns one instance per process, keyed
by name rather than by module binding, because after a reload some modules have
been re-evaluated and some have not. Every long-lived holder goes through it —
boards, panes, pane boards, sockets, selection, snapshots, files, the library,
the change feed, the injector — and new ones have to. A module-level `new Map()`
holding anything a browser tab can see is now a bug.

Two smaller rules fall out. A module that *creates* something at evaluation time
has to check first: `board-store.ts` re-running `boards.set(SCRATCH_KEY, …)`
would blank the scratch board under an open pane. And a handler registered on a
kept object has to be replaced rather than added, or the second reload answers
every WebSocket connection twice.

Keeping an instance keeps its methods too, so editing `change-feed.ts` or
`injection.ts` leaves those two singletons running the old code until a real
restart. That is the right side of the trade: a cursor a hook cannot trust again
costs more than a few seconds of stale narration.

## A rule nothing enforces is not a rule (TASK-059)

Both of those two smaller rules were discovered as bugs, by reloading a live
server and looking. That is the objection, and it is a good one: the safety of
every reload rested on every module obeying conventions that nothing checked,
and the failure was silent corruption of a canvas somebody was drawing on
rather than a crash. `bun --hot` re-evaluates the **entire module graph**, not
the file that changed, so the board-store bug reproduced when only `server.ts`
was edited. Every module with an evaluation-time side effect was a hazard on
every save, and the blast radius grew with the codebase.

Three things changed, and hot reload stays only because all three landed.

### A reload is asked for, not caused by a keystroke

This is the change that matters most, and it removes most of the risk before
any checking. A file save is not a moment anybody chooses; `archboard reload`
is.

bun offers no way to narrow what `--hot` watches, but it does not have to. What
bun re-evaluates by itself is the **entry point**, and the entry point can be a
file that does almost nothing. `src/dev-canvas.ts` is that file: `bun --hot`
watches it, re-evaluates it on every save, and it re-imports the canvas only
when the generation in a reload token has moved (`src/core/reload-token.ts`).
An ordinary save therefore re-runs about ten statements and stops. The canvas
is untouched: same modules, same objects, same handlers.

`archboard reload` writes a new generation into that token, which is a file
change bun does see, so the entry re-evaluates, notices the generation moved,
and imports `./server.js?reload=N` with a cache-busting query to get a fresh
graph. The token lives in the state directory, keyed by port, so a dev session
never appears in `git status` and two canvases cannot reload each other.

Measured on bun 1.3.14, because none of this is documented:

| | happens |
|---|---|
| `bun --hot` on any watched file change | the **whole** graph re-evaluates, not the changed file |
| `fs.utimes` on a watched file | nothing. bun wants new bytes, not a new mtime |
| dynamic `import('./x.ts?v=N')` with no `--hot` | re-reads `x.ts` only. Its imports stay cached, so this cannot reload a graph |
| a dynamically imported, runtime-computed, out-of-tree path | watched like any other |

The third row is why `--hot` is still needed at all: busting the query on one
module does not reach its dependencies, and rewriting every import specifier is
a bundler's job. The fourth is what lets the token live outside the repo.

`POST /api/reload` is refused with a 409 by any canvas that was not started
under `bun run dev:canvas`, and `/health` reports `reloadable` so the refusal
is predictable rather than a surprise.

### A static check, so the conventions are not remembered

`scripts/check-module-scope.mjs` parses the static import graph of
`src/dev-canvas.ts` and `src/server.ts` and fails on module-scope statements
that only work the first time a module is evaluated: a `new` that is not a
frozen lookup table, a literal something writes to later, a timer, a listener
added without a paired removal, a bind, and a write to long-lived state without
a presence guard. It errs toward false positives, and a finding can be waived
with `// hot-safe: <reason>`, which is a sentence somebody had to write. That is
the point: a silent exemption is the thing being removed.

The scope is a graph rather than a directory so that a module joins the checked
set the moment the canvas imports it, and nobody has to remember to add it.

Both TASK-057 bugs are fixtures under `scripts/fixtures/module-scope/`, so the
check is proved to catch them on every run rather than in a task note, and
`reload-safe.ts` is the other half: a check that only ever fails is as useless
as one that never does.

It found one bug on its first run. `src/utils/logger.ts` built a winston
Console and File transport at module scope, so every reload opened another
write stream on the same log file while modules holding the old logger kept
writing to that. Nothing crashed. The file descriptors just accumulated, one
per reload. It is behind `kept()` now.

**What it cannot see**, and this is why it is not the only mechanism: it knows
nothing about types, so it matches receivers by name and cannot tell a kept
container from a local one, or see one reached through a property. It takes a
`removeAllListeners` in the same module as evidence of replacement without
checking the two run in that order. State created inside a function that a
module-scope statement calls is invisible to it, and it does not follow dynamic
imports.

### A canary, because the static check will miss things

`src/core/reload-canary.ts` reads the live process before the re-evaluation and
again after, and reports anything that moved: an open board's element count, a
pane's registration and the board it holds, the socket count, and the change
feed's id and cursor. The cursor may go forwards, because real work can land
mid-reload; anything else is damage.

It reads out of the kept registry by name rather than importing the modules
that own that state, because it lives on the dev entry's side of the reload
boundary and an import there would bind to whichever copy happened to be
current. The duplication is the price of not sharing an idea of the truth with
the thing being checked.

A broken reload is reported to the terminal **and** to every connected tab
(`reload_broken`), because those are two different people: the developer who
caused it has a terminal, and whoever is standing at the board with work that
may no longer be there does not.

`scripts/check-hot-reload.mjs` proves all of it against a real canvas, ending
by removing the board store's presence guard under a live pane and checking
that the emptied board is reported rather than accepted.

### Which hazards survive a stateless server

The canvas holds unsaved boards today, and a design principle has since been
stated that it should not: the vault is meant to be the truth. If that lands,
some of the argument above weakens and some does not, so they are worth keeping
apart.

**Hazards that exist only because the server holds unsaved board state.** A
reload that drops or blanks a board loses work that exists nowhere else. That is
the board-store bug, and it is the loudest thing the canary watches. A stateless
server would make it recoverable, and this half of the case would shrink to an
annoyance.

**Hazards that exist wherever board content lives.** A doubled connection
handler answering every message twice. A port bound a second time against the
process that already holds it. A listener or a timer registered again on every
reload, accumulating. A socket dropped while the tab still believes it is
connected. A log file handle reopened per reload. None of these is board
content: they are session state and handler identity, and a stateless server
would leave every one of them exactly as it is.

The second list is the durable one, and on its own it is enough to justify
enforcement. The static check is aimed at all of it, and only the board half of
the canary would become less interesting. **The verdict here does not depend on
the server keeping unsaved state.**

### The verdict

Hot reload stays. The trigger is explicit, the shapes that break it are refused
in source, and a reload that breaks something says so to both the terminal and
the wall. If any of the three is removed, the honest move is to remove hot
reload with it, because what is left is a convenience resting on somebody
remembering a rule, and this repo has spent too long removing exactly that.

**`canvas start` still watches nothing**, and now cannot reload at all.
Reloading is cheap when a developer typed the command that caused it and
expensive when anything else did, so the plain command a human or an agent runs
spawns a plain process with no token and no watcher. The check reads the command
line of the server the CLI actually started, fails if `--hot` or `--watch` is on
it, and confirms that the canvas refuses a reload and says how to get one.

The frontend's half is vite's, unchanged: `bun run dev` runs both.

## What is left in dist/

`dist/frontend/`, from vite, and nothing else. The server serves it from
`../dist/frontend` relative to `src/`, which is the same directory it resolved
to from `dist/`, so no path moved. A checkout from before this change has
compiled `.js` under `dist/` that nothing reads; `rm -rf dist && bunx vite
build` clears it.
