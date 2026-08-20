---
status: accepted
---

# No build step: the canvas runs from its source

Upstream compiled its TypeScript and ran the output. We kept doing that after
moving to bun, which runs TypeScript directly. Nobody decided to keep it. It
was inherited, and ADR 0002 says inherited conventions do not get to stay
merely because they are there.

## Why that is a problem

A compiled copy is a second copy of the program, and a second copy can be stale
while everything still appears to work. Staleness has no symptom of its own:
every command runs, and each answer is correct for the copy that produced it.

A canvas runs whatever it read when it started. Rebuild while it is up and it
keeps answering as it did before, with nothing anywhere saying so. In one
session that produced two commands disagreeing about one board, because one
computed its answer in a short-lived process from the new copy and the other
answered from a canvas started before it. Neither was wrong on its own terms.
Earlier in the same session the same ambiguity was diagnosed wrongly, and the
wrong diagnosis cost a person their running canvas. TASK-056 is that mechanism
written up as a bug.

## The decision

The canvas and the command line run from source. Only the browser bundle is
built, because a browser cannot be handed TypeScript.

This does not make staleness impossible. A canvas that has been up for an hour
is still running what it read an hour ago. It removes the layer where two
copies of the program had different names and neither was labelled.

## What it costs

**Type checking stops happening by accident.** It used to come free, because
every test run compiled first and a type error failed the compile. Running from
source removes that, silently, so type checking is now an explicit first step
of the test run. That is the load-bearing part of this decision: take that step
away and type errors ship without anyone noticing the guard is gone.

**bun becomes a hard dependency of anything that launches archboard**, not just
of developing it. That includes clients that spawn it themselves, which often
have a shorter path to look along than a shell does.

**Nothing exercises the wire under node any more.** The checks run under
whatever runs them, which is the honest thing to check because it is what
actually launches a canvas now. If archboard ever has to run under node again,
that is a build again, and this is the decision to reopen.

## Reloading a running canvas

A canvas holds work: boards somebody has drawn on and not yet saved, panes
arranged on a wall, a change feed whose cursor a hook may have recorded.
Restarting it to pick up a change throws all of that away, and the unsaved
drawing is the one thing that cannot be recomputed.

So a canvas can be reloaded in place instead, keeping what is on screen. Four
conditions come with it, and it stays only while all four hold.

**A reload is asked for, never caused by saving a file.** A save is not a
moment anybody chooses. This is the condition that removes most of the risk,
and it removes it before any checking.

**The shapes that break a reload are refused in the source rather than
remembered.** State that must outlive a reload lives in one place and is reached
by name rather than by which copy of a module is asking. Anything that creates
such state has to check whether it already exists, and a handler attached to
something that survives has to replace rather than accumulate. Both of those
rules were discovered as bugs, by reloading a live canvas and looking, which is
exactly why they are checked rather than documented: one silently emptied a
board under an open pane, the other made a canvas answer every message twice.
A rule nothing enforces is not a rule, and this repository has spent too long
removing rules of that kind.

**A reload that breaks something says so, to the terminal and to the wall.**
Those are two different people. The developer who caused it is looking at a
terminal. Whoever is standing at the board, with work that may no longer be
there, is not.

**The plain command that starts a canvas watches nothing and cannot reload at
all.** Reloading is cheap when a developer typed the command that caused it and
expensive when anything else did.

If any of the four is removed, the honest move is to remove reloading with it,
because what is left is a convenience resting on somebody remembering a rule.

### What this argument depends on, and what it does not

ADR 0015 has since made the vault the truth, so a canvas is not meant to hold
unsaved boards at all. That weakens part of the case above and leaves the rest
untouched, which is worth keeping apart.

Losing a board to a reload is only serious while a board can exist in a canvas
and nowhere else. Under ADR 0015 that becomes recoverable.

Everything else survives regardless of where board content lives: a canvas
answering every message twice, a port claimed a second time, listeners and
timers accumulating on each reload, a pane dropped while it still believes it
is connected, a log handle reopened until the descriptors run out. None of that
is board content. It is session state and handler identity, and it would look
exactly the same with an empty canvas.

That second list is the durable half, and on its own it justifies the
enforcement.

## Consequences

Anyone with a checkout from before this has a compiled copy of the program
lying around that nothing reads. Clearing it is worth doing, because the canvas
serves that directory to the browser.

Reloading is a maintainer's act, so it is not on the command line an agent or a
user sees. It belongs with the other things that need the checkout.

Measurements behind all of this, including what bun re-evaluates and what the
source check cannot see, are in `docs/design/hot-reload-under-bun.md`, which is
dated and expected to age.
