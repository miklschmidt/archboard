# Reloading a running canvas under bun

Measured on bun 1.3.14 in August 2026, because none of it is documented.
This is a design note, not a decision. ADR 0014 is the decision; the numbers
and mechanisms here are expected to age and should be re-measured rather than
trusted.

## What bun re-evaluates

| Trigger                                                    | What happens                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `bun --hot`, any watched file changes                      | the **whole** import graph re-evaluates, not the file that changed                 |
| touching a watched file's mtime without changing its bytes | nothing. bun wants new bytes                                                       |
| a cache-busting dynamic import with no `--hot`             | re-reads that one module. Its own imports stay cached, so it cannot reload a graph |
| a dynamically imported, runtime-computed, out-of-tree path | watched like any other                                                             |

Row one is why every module with an evaluation-time side effect was a hazard on
every save: editing one file re-ran all of them. Row three is why a
cache-busting import alone is not enough to reload a server. Row four is what
lets the reload token live outside the repository, so a development session
never shows up as a pending change.

## How an explicit trigger is possible

bun offers no way to narrow what `--hot` watches. It does not need to. What bun
re-evaluates on its own is the entry point, and an entry point can be a file
that does almost nothing: read a generation number, and re-import the canvas
only if it has moved. An ordinary file save then re-runs about ten statements
and stops, leaving the running canvas untouched. Asking for a reload writes a
new generation, which is a file change bun does see.

The token is keyed by port, so two canvases cannot reload each other.

## What the static check cannot see

It parses source without type information, so:

- It matches receivers by name and cannot tell long-lived state from a local of
  the same name, nor see state reached through a property.
- It accepts a listener removal in the same module as evidence of replacement,
  without checking the two run in that order.
- State created inside a function that a module-scope statement calls is
  invisible to it.
- It does not follow dynamic imports.

That list is the argument for the canary. A check that could see everything
would make the runtime one unnecessary, and it cannot.

## What a reload costs

Keeping a long-lived object keeps its methods, so editing the module that
defines one leaves that object running the previous version until the process
is restarted. The change feed and the injector are the two that matter. The
alternative is discarding them, which discards a cursor that a hook may have
saved, and a cursor that cannot be trusted again costs more than a few seconds
of stale narration.
