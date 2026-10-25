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

Earlier in the same session, the same ambiguity got a wrong diagnosis, and the
wrong diagnosis cost a person their running canvas. TASK-056 is that mechanism
written up as a bug.

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

## Reloading a running canvas

> Superseded by ADR 0021. The direct-TypeScript and no-build decision above
> remains accepted.

A canvas holds work: boards that somebody drew on and did not save yet, panes
arranged on a wall, and a change feed whose cursor a hook possibly recorded.
Restarting it to pick up a change throws all of that away. The unsaved drawing
is the one thing that the system cannot recompute.

So a canvas can reload in place instead. The reload keeps what is on screen.
Four conditions come with it, and it stays only while all four hold.

First, a reload is asked for, never caused by saving a file. A save is not a
moment anybody chooses. This condition removes most of the risk, and it removes
it before any check runs.

Second, the shapes that break a reload are refused in the source rather than
remembered. State that must outlive a reload lives in one place and is reached
by name rather than by which copy of a module is asking. Anything that creates
such state must find out whether it already exists. A handler attached to
something that survives must replace and not accumulate.

Both of those rules were discovered as bugs, by reloading a live canvas and
looking. That is exactly why they are checked rather than documented. One bug
silently emptied a board under an open pane. The other made a canvas answer
every message twice. A rule nothing enforces is not a rule, and this repository
spent too long removing rules of that kind.

Third, a reload that breaks something says so, to the terminal and to the wall.
Those are two different people. The developer who caused it is looking at a
terminal. Whoever is standing at the board, with work that is possibly gone, is
not.

Fourth, the plain command that starts a canvas watches nothing and cannot reload
at all. Reloading is cheap for the developer who typed the command that caused
it, and expensive for anything else that causes it.

If somebody removes any of the four, the honest move is to remove reloading with
it. That is because what is left is a convenience that rests on somebody
remembering a rule.

### What this argument depends on, and what it does not

ADR 0015 since made the vault the truth, so a canvas is not meant to hold
unsaved boards at all. That weakens part of the case above and leaves the rest
untouched. The two parts follow separately.

Losing a board to a reload is only serious while a board can exist in a canvas
and nowhere else. Under ADR 0015 that loss is recoverable.

Everything else survives regardless of where board content lives:

- A canvas that answers every message twice
- A port that is claimed a second time
- Listeners and timers that accumulate on each reload
- A pane that is dropped while it still believes it is connected
- A log handle that is reopened until the descriptors run out

None of that is board content. It is session state and handler identity, and it
looks exactly the same with an empty canvas. That second list is the durable
half. On its own it justifies the enforcement.

## Consequences

Anyone with a checkout from before this decision has a compiled copy of the
program lying around that nothing reads. Clear it with
`rm -rf dist && bun run build`. The canvas used to serve the whole of `dist` to
the browser, so that copy was reachable over http by path. TASK-058 narrowed the
mount to `dist/frontend`. `bun run test:bind` plants a file in `dist/`. If the
server serves that file, the test fails.

ADR 0021 removed the maintainer-only reload command described above. Backend
source changes now require an explicit server restart.

ADR 0021 removed the reload implementation, its analyzer, and its supporting
measurements. This ADR continues to govern running backend TypeScript source
directly and building only the frontend.

## Amendment of 2026-10-24: the renderer core is built

[ADR 0057](0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)
makes the renderer a Rust crate, compiled to WebAssembly. So the browser bundle
is no longer the only build: `bun run build:core` builds the core (TASK-520.01).
The CLI and the server still run their TypeScript from source.

The core build records the hash of the sources it was made from. A Bun process
compares that hash with the sources in its checkout. If they differ, it refuses
to draw and names `bun run build:core`. So a stale core has a symptom, which is
what this decision asks of every copy. The frontend build always builds the
core first, so a browser bundle holds the core of its sources.
