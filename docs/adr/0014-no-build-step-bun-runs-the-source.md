---
status: accepted
---

# No build step: the canvas runs from its source

Upstream compiled its TypeScript and ran the output. We kept doing that after
moving to bun, which runs TypeScript directly. Nobody decided to keep it. It was
inherited, and an inherited convention does not get to stay merely because it is
there.

## Why that is a problem

A compiled copy is a second copy of the program, and a second copy can be stale
while everything still appears to work. Staleness has no symptom of its own:
every command runs, and each answer is correct for the copy that produced it.

A canvas runs whatever it read at its start. If somebody rebuilds while the
canvas is up, it keeps answering as it did before, with nothing anywhere saying
so. In one session that produced two commands disagreeing about one board. One
computed its answer in a short-lived process from the new copy. The other
answered from a canvas started before it. Neither was wrong on its own terms.

## The decision

The canvas and the command line run from source. Only the browser bundle is
built, because a browser cannot be handed TypeScript.

This does not make staleness impossible. A canvas that stays up for an hour
still runs what it read an hour ago. The decision removes the layer where two
copies of the program had different names and neither was labeled.

## What it costs

The decision has three costs:

- Type checking no longer happens by accident. It used to come free, because
  every test run compiled first and a type error failed the compile. Running
  from source removes that, silently. So type checking is now an explicit first
  step of the test run. Without that step, type errors ship without anyone
  noticing that the guard is gone.
- bun is now a hard dependency of anything that launches archboard, not just of
  developing it. That includes clients that spawn it themselves. Those clients
  often have a shorter path to look along than a shell does.
- Nothing exercises the wire under node any more. The checks run under whatever
  runs them. That is the honest thing to check, because it is what actually
  launches a canvas now. If archboard ever has to run under node again, that is
  a build again, and this is the decision to reopen.

## Consequences

The canvas used to serve the whole of `dist` to
the browser, so that copy was reachable over http by path. TASK-058 narrowed the
mount to `dist/frontend`. `bun run test:bind` plants a file in `dist/`. If the
server serves that file, the test fails.

ADR 0021 removed the reload implementation, its analyzer, and its supporting
measurements. This ADR continues to govern running backend TypeScript source
directly and building only the frontend.

## Amendment of 2026-10-24: the renderer core is built

[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)
makes the renderer a Rust crate, compiled to WebAssembly. So the browser bundle
is no longer the only build: `bun run build:core` builds the core (TASK-520.01).
The CLI and the server still run their TypeScript from source.

The core build records the hash of the sources it was made from. A Bun process
compares that hash with the sources in its checkout. If they differ, it refuses
to draw and names `bun run build:core`. So a stale core has a symptom, which is
what this decision asks of every copy. The frontend build always builds the
core first, so a browser bundle holds the core of its sources.
