# The vault is the truth, and the agent-friendly shape is an input format

The canvas server holds no authoritative copy of a board. A board is the
`.excalidraw.md` note in the vault, in Excalidraw's own element format, and
that note is the only thing that is ever true. The process reads it, writes it,
and keeps nothing of it.

## What this rules out

**Board content in memory.** No board map that a reader can consult instead of
the note, no unsaved work that exists only in a process, no second copy that
can drift from the first.

This is not what the code did. Measured on a board an agent drew that no
browser had rendered:

```
in memory:   1 element  | agent seeds: 1 | native bound text: 0
             the rectangle carried label: {"text":"Never Rendered"}
persisted:   2 elements | agent seeds: 0 | native bound text: 1
```

The note was already right. The process was holding a different shape of the
same board, and the difference was invisible until something forced a
conversion.

**Session state is not board content and is not in question.** Sockets, pane
registrations, which pane has focus, what a human has selected: none of that
can live in a note, all of it dies with the tab, and a rule that forbade it
would be unimplementable. The line is board content, not memory.

## Conversion

Conversion is where divergence comes from, so there is one of it, in one
direction, at one boundary.

**The agent-friendly shape is an input format and nothing else.** `label`,
`text`, `startElementId`, `endElementId` and tuple points are accepted at the
API boundary, converted once on write, and never seen again. What comes back
out is native, because a conversion on read would be a second converter, and
two converters is the thing this decision exists to prevent. `describe` already
folds bound text and multi-element nodes, so an agent that wants a summary has
one without anybody converting anything.

**One implementation, shared by everything that needs it.** Not a server module
and a browser module that are meant to agree. The frontend already imports
`src/core/labels` and `src/core/appearance` directly, so this is an established
pattern rather than a new one.

That means dropping Excalidraw's `convertToExcalidrawElements` from our path.
It is a second implementation of our own conversion, we do not control it, and
we already correct its output by hand: `frontend/src/canvas/elements.ts` has a
function whose entire job is to "restore startBinding/endBinding/boundElements
after convertToExcalidrawElements strips them".

## Why, in one line each

Four bugs came from the gap between the stored shape and the rendered one.
TASK-024, labels breeding a new bound text every round-trip until one arrow
carried 42 copies of its own label and collapsed to a height of
0.9999999999999716. TASK-028, a human's rename reverting. TASK-029, an emptied
label coming back. TASK-034, bound label coordinates drifting from their
container, once by 1170px, which skewed the scene box and every layout signal
built on it.

Each was fixed on its own terms. The gap that produced them stayed until this.

## Consequences

**A write returns the resulting board.** The browser still sends a delta
upward, because the baseline is what stops a stale tab claiming a deletion for
an element it never received (TASK-016), and that safety property is not being
given up. What comes back is the whole board as the note now holds it, and the
browser renders that rather than its own patched copy. Divergence cannot
accumulate across a session, because every write is a resync.

**Fan-out has to go first.** `align`, `distribute`, `lock` and `group` issue one
write per element, and `align` fires them concurrently. Against a note that is
the truth, that is several read-modify-write cycles racing on one file, which
is lost updates rather than merely slow. Those routes become one batched write.

Not through `apply`, which an earlier draft of this ADR claimed and which is
wrong: `src/cli/commands/elements.ts` loops one PUT per update and one DELETE
per delete, and only creates are batched. The route that already takes many
elements in one write is `POST /api/elements/changes`, the one the browser
reports through. Measured: twenty PUTs cost 2.87 ms, the same twenty as one
batched write cost 0.13 ms. The CLI help repeats the same wrong claim and
should be corrected with it.

**Reads cost a file read.** Measured at 1.27 ms for 300 elements and 0.25 ms
for 55. A full atomic read-modify-write is 11.89 ms, of which 6.2 ms is fsync
and does not vary with size. That is the budget. Batching is what keeps it.

**Two writers need excluding from each other.** That is ADR 0016.
