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
impossible. A long-running server still executes the source it read at start.
But it removes one whole layer of it, and it removes the layer where the two
copies had different names and neither was labelled.

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

## Hot reload stays out of `canvas start`

`bun --watch` restarts the process on every file save, and boards live in
memory, so a restart drops unsaved work. On this canvas that work is a human
rearranging boxes on a wall display, which is the input the whole tool exists to
collect and the one thing that cannot be recomputed.

So watching is `bun run dev:reload`, an explicit choice with the cost written
next to it, and never what `canvas start` does. The frontend gets real hot
reload through `bun run dev`, because vite replaces modules in the browser
without touching the server holding the boards.

## What is left in dist/

`dist/frontend/`, from vite, and nothing else. The server serves it from
`../dist/frontend` relative to `src/`, which is the same directory it resolved
to from `dist/`, so no path moved. A checkout from before this change has
compiled `.js` under `dist/` that nothing reads; `rm -rf dist && bunx vite
build` clears it.
