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
by editing real source files under a real canvas.

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

**`canvas start` still watches nothing.** Reloading is cheap when a developer
typed the command that caused it and expensive when a stray file save causes it
under someone's hands, so the plain command a human or an agent runs spawns a
plain process. The check reads the command line of the server the CLI actually
started and fails if `--hot` or `--watch` is on it.

The frontend's half is vite's, unchanged: `bun run dev` runs both.

## What is left in dist/

`dist/frontend/`, from vite, and nothing else. The server serves it from
`../dist/frontend` relative to `src/`, which is the same directory it resolved
to from `dist/`, so no path moved. A checkout from before this change has
compiled `.js` under `dist/` that nothing reads; `rm -rf dist && bunx vite
build` clears it.
