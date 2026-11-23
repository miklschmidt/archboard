---
status: accepted
---

# A relationship states how it travels and what it does

The owner decided on 2026-11-22 that every relationship states two things: its kind, how it
travels, and its effect, what it does (owner decisions 23 to 27, TASK-663). Two advisors settled
the rest in two rounds. [ADR 0095](0095-a-picture-is-read-through-a-lens.md) records how a picture
is read through these two fields.

This record amends [ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md),
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and
[ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md).

Amended on 2026-11-22 (TASK-663.08 to TASK-663.12): `sync` and `async` replace `call`, the
effect is drawn by the head and the ends of a line rather than by its dash, and lines join only
relationships of one kind and one effect. Two advisors settled it in three rounds and the owner
chose the decoration. The vault format 2 had not shipped, so it changed in place.

## Context

Pictures of many modules were unreadable. Of this repository's 1328 relationships, 78% were
`call` and 12% `dependency`. A `call` said only that one part invokes another: it did not say
whether the part changes something, reads something or only works out an answer. A reader asks
one question at a time, such as where state changes, and the picture could not answer it.

A first design put the answer in the kind, with `mutation`, `query` and `compute` beside `http`
and `event`. Then an HTTP request that changes state had to choose between two true kinds. The
owner split the two questions into two fields.

The first version of this record kept `call` as the kind of all traffic in process. Then 1,027 of
this repository's 1,191 relationships had one kind, and a picture of one module, such as Painting,
drew one gray mass. The owner rejected that: "If 'call' is in-process traffic, the kind should be
'in-process traffic' and not 'call'", and a catch-all kind says nothing. The work was to give
traffic in process real kinds.

## Decision

### The kind says how a relationship travels

The kind names the mechanism between the two named ends. Archboard has eleven built-in kinds:

| Kind         | How it travels                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| `sync`       | In process, and the caller has the answer when the call returns.                   |
| `async`      | In process, and the call returns before the work is done: awaited, or left to run. |
| `http`       | An HTTP request.                                                                   |
| `rpc`        | A remote procedure call with its own contract, such as gRPC or JSON-RPC.           |
| `event`      | A named message that the source publishes and that listeners receive.              |
| `queue`      | Work that the source puts on a queue for a worker.                                 |
| `stream`     | Successive bytes or records with no message name: a pipe, a stream, a media track. |
| `spawn`      | The source starts a process.                                                       |
| `render`     | The source places the target's component in its output.                            |
| `storage`    | The source reads or writes through a store's own interface: files, SQL, keys.      |
| `dependency` | A declared requirement. Nothing of the target runs at run time.                    |

A relationship that fits no built-in kind takes a kind that the vault adds. The owner retired
`other` on 2026-11-22: a kind that fits everything says nothing, as the plain `call` did, and no
relationship of this repository used it. The upgrade tool refuses a relationship that keeps
`other` and names the two ways out.

### In process, a call is sync or async

`call` is gone. A relationship in one process is `sync` when the caller has the answer as the
call returns, and `async` when the call returns before the work is done. An awaited call is
`async` (`await`, `.await`, `.then`), and so is work that the source starts and leaves to run: a
task, a goroutine, `spawn`, `create_task`, `Task.Run`, `Task {}`, `dispatch_async`,
`pthread_create`, or an async function called without being awaited. A timer is `async`. A plain
call of a function that is not async is `sync`.

The owner chose this split for the reader. The kind is read with the effect, and the cases off
the diagonal are what a reader hunts for: "when i look at a diagram and i see an synchronous
compute call, that's when i would dig deeper and likely plan work to make that call async." That
async follows the effect (it carries 39% of this repository's mutations and 5% of its computes)
is the signal, not a reason against it.

Both kinds accept the evidence kind `call`. The evidence id `call` and the finding
`DEPENDENCY_CALLED` keep their names, because they name a call in the code, not a kind of line.
The names are "Sync" and "Async", which keep the word call out of the legend.

The configuration refuses `relationshipKinds.call` and names `sync` and `async`. A lens selector
or `--hide-kind` that names `call` is refused with the same words. An address or a recipe from
before that hides `call` reads as hiding both. A retained reading from before keeps its own
recorded vocabulary, `call` included (ADR 0065).

The built-in kinds sit under a vault's own. A vault adds a kind with an id of its own, and its
entry for a built-in id replaces that kind whole. A kind that the vault adds must name its color,
because the kind is the color of its lines. The configuration refuses one without a color at
`relationshipKinds.<id>.color`.

`data` is gone. Its place for direct store access is taken by `storage`. Of the 34 `data`
relationships in this repository, 25 meant "data passes", and the old name invites that again.

### The effect says what a relationship does

The effect has three values:

- `mutation`: the operation can change state or have an effect outside the caller.
- `query`: it reads held or fetched state, such as a store, the clock or a context.
- `compute`: its answer follows from what the source hands over alone.

Every relationship states its effect, a vault's own kinds included. Only a `dependency` may
omit it, and the omission means "a declared requirement only". A dependency may also state one.

An agent classifies each relationship from the code by the work the source asks the target to do.
It reads the callee or its contract and asks in order:

1. Can the operation have a side effect? Then it is a `mutation`. A conditional write, a
   publication, an acknowledgement that removes work and the installing of a subscription are
   side effects. Follow delegated work. A return value does not make a write a read.
2. Otherwise, does it read held or fetched state? Then it is a `query`.
3. Otherwise, it is a `compute`.

Doubt about a side effect resolves to `mutation`. A relationship that stands for several
operations takes the strongest effect among them: `mutation`, then `query`, then `compute`.

Every kind is judged by its operation, never by its kind. An event publication or a queue
submission mutates, and a peek at retained work queries. A spawned short-lived transform
computes, one that reads a Git ref queries, and the start of a persistent server mutates. A
`render` is judged by placing the component and by what it does when it mounts.

These are rules of evidence, and they live in the authoring guidance of the archboard skill. The
schema holds the three values and the exception for `dependency`, with no table of the effects
each kind allows.

### The module files change format

Module files move to format 2 (`"schemaVersion": 2`), whose relationships state an effect. A
write of a relationship without one is refused whole. The refusal names the module file, the
path `outgoing.<n>.effect` and the relationship's id. Format 2 had not shipped when `sync` and
`async` replaced `call`, so the format changed in place, with no format 3.

A vault is in the old format when a module file has format 1, its configuration records a
`dash` on a kind, or a relationship still has the kind `call`. Such a live vault opens read-only with one diagnostic, `UPGRADE_REQUIRED`, which
names the upgrade, and not with one error for each relationship. The vault check warns once.
Every edit is refused with the same diagnostic until the vault is upgraded. A claim, a retention
and the import of an old bundle still work, because they write no live module.

A retained checkpoint reads exactly as stored, with its own policy and modules
([ADR 0065](0065-checkpoints-retain-architecture-without-selecting-current.md)). A reading from
before the upgrade keeps its recorded look: its kinds keep their dash.

A comparison counts an effect as changed only when both sides state one. Otherwise every
relationship would read as changed against a base from before the upgrade.

### The upgrade

TASK-663.04 builds this step and may adjust this section.

An upgrade tool, separate from legacy board migration, moves an old vault to the current format.
It writes an inventory of every relationship, dependencies included, grouped by root module, with
its old kind, its anchor and its evidence. Agents fill each one with a kind and an effect from the
code. The tool gives no default effect.

A former `call` starts with the kind its anchored call says in the code facts: `async` where the
call is awaited or started, `sync` for a plain call of a function that is not async, and blank
otherwise. The code facts of TypeScript, Rust, Python, Go, C#, Swift, Objective-C and C say
which, where the language can tell; where it cannot, they say so and never guess. An agent reads
each blank in the code and decides it. The configuration drops an entry that restates the old
default of `call`. A gap, an effect that the agent could not establish, is
listed, and a side effect that cannot be ruled out is a `mutation`. Installing writes the current
format only from a filled inventory that somebody reviewed, and keeps every relationship id.

### The drawing

TASK-663.10 draws this and may adjust this section.

The kind is the color of a line, and the effect is its decoration: the head at the target, a mark
at the caller and the body. The owner settled the split: kind by color, effect by decoration.

Every built-in kind has an ink, paired for both themes: `sync` a quiet low-chroma slate, the
quietest ink that still meets the contrast floors of DESIGN.md, so that the boundary kinds and
`async` stand out over the many sync lines; `async` amber; `http` sky; `rpc` blue; `event` violet;
`queue` lime; `stream` cyan; `spawn` fuchsia; `render` pink; `storage` emerald; `dependency`
indigo. A kind no longer sets the arrowhead.

| Effect        | Body                         | At the target                                      | At the caller |
| ------------- | ---------------------------- | -------------------------------------------------- | ------------- |
| Mutation      | solid                        | a solid wedge, and the write's imprint on the card | plain         |
| Query         | solid                        | an eye: rounded back, dot at center, sharp tip     | a hollow ring |
| Compute       | solid                        | an "=" (two short bars) just behind a small point  | plain         |
| Declared only | long broken strokes, thinner | a detached open chevron                            | plain         |

The imprint of a mutation is a short stripe along the card's edge, centered on the tip, on a soft
glow in the kind's ink, and kept inside the port's share of the edge. It lies just in front of the
edge: the card is drawn over its lines, and a stripe centered on the edge showed only half its
width. The live reader fades the stripe at both ends; an export draws it flat over a blurred glow.
The owner asked for a thicker stripe with a colored glow, and the advisors set it at 3.6, as thick
as an emphasised line, so the wedge keeps its point, with a glow a lane (16) broad, 0.4 solid at
its heart on the light ground and 0.6 on the dark one, where the inks are already dimmed. Exports
glow too, because a still picture in a README is half of what readers see, and the export's
colors already need the same modern CSS that its blur does. The ring of a query sits on the caller's edge, where the answer lands. The body
of a compute stops before its bars.

The body is solid for every effect but declared-only. The owner decided it: "Dashes / dots make
busy diagrams harder to follow, so use sparsely." The ends carry the effect. Every mark scales
with the picture, as its line does, one size in picture units at every zoom, near or far. A viewer
once grew the marks to a least size on screen when the picture was seen from far, and the far view
grew them with its wider lines; the owner dropped both: "they barely change anyway so they only
complicate things." Every line draws thicker than before, and the weight of emphasis stands on top
of that base.

Everything is drawn in the kind's ink. A comparison's standing color replaces the ink and keeps
the shapes, so the effect still reads under a comparison. Emphasis thickens the body and keeps
the openings.

Nothing moves by default. Pointing at a line or a card plays its effect once, in the look of the
spark (ink toward the text color, one pass), never as a train of pulses: a mutation runs to the
target and lights the imprint, a query lights the eye and runs back to the caller's ring, a
compute's "=" brightens once, and a declared-only line stays still. On a line with authored
traffic, the authored traffic wins, and its volume and speed stay authored only. Reduced motion,
SVG and PNG show the still marks, which carry the whole meaning.

A line's label starts with its kind's name and a middle dot, except on a `sync` line, so that its
kind never rests on color alone (WCAG 2.2 AA, [PRODUCT.md](../../PRODUCT.md)). A label with no
kind name is `sync`, the most common kind, and its labels would otherwise grow and move routes.

### Lines join one kind and one effect

Relationships between the same two drawn ends join into one line only when they share both their
kind and their effect. Different pairs draw as separate lines. A joined line's label keeps its
"+N" count, and selecting a line lists each relationship it joins, with its kind and its effect.
The double-rail line of mixed kinds is retired, with its mark in the legend: a line now has one
kind and one effect, so it never claims a pair that none of its relationships has, such as an
async mutation made of an async query and a sync mutation.

### The code check on dependencies

A dependency means that nothing of the target runs at run time. The code check reports
`DEPENDENCY_CALLED`, as information, for a dependency whose anchor is a call into a function or
a value of the target, or, with no anchor, whose code from source to target contains one: 111
dependencies of this repository when it was built. The finding names both ends and the call, and
the agent then states the call with its kind and effect. It holds whatever evidence a vault
accepts for a dependency: removing `call` from that list would have been a warning, not
information, and silent in every vault whose configuration lists `call` itself.

### The code check on sync and async

The code check reports `CALL_TIMING_MISMATCH`, as information, for a `sync` relationship whose
anchored calls are all awaited or started, and for an `async` relationship whose anchored calls
are all plain. The relationship is real; only its kind is to be stated again. Where one call site
is unknown, or the sites disagree, the code does not decide, and the check says nothing.

## Considered and rejected

- **The effect as a kind** (`mutation`, `query` and `compute` beside `http`). A relationship has
  a mechanism and an effect at once, so one field makes an HTTP mutation choose between two true
  answers.
- **Keeping `call` as the in-process kind** (owner decision 25, which this amendment reverses).
  It left 88% of the lines of this repository in one kind and one gray, and the owner did not
  notice the reversal of decision 24 until a picture of Painting drew one gray mass.
- **`in-process` as one catch-all kind** ("In-process traffic"). It renames `call` and splits
  nothing: the owner's own words, "a catch-all says nothing", retired `other` for the same reason.
  One advisor kept it beside narrower kinds, which still left 813 relationships in it.
- **A `callback` kind**, for a function that the target keeps and calls later. Passing a function
  does not prove that the target registers it, and the 31 candidates here split into sync
  registrations and async later calls, which `sync` and `async` already say. Its advisor withdrew
  it.
- **A `construction` kind**, for a constructor of a type that the target owns. Of 16 candidates
  here, 14 build error classes, and ownership of a type is a judgment the code does not settle.
- **A `value-access` kind**, for a read or write of a binding that the target owns. Its 26
  candidates here are mostly constants and types, and a read of shared state is already a `query`.
- **Kinds by the role of the target** (a store, a cache, a clock, a logger, a parser). 957 of
  1,027 targets here are modules or functions with no such role, and a role belongs on the card,
  not on the line.
- **Async as a third field beside the kind.** A reader would need a third channel on the line,
  and in process the timing is how the call travels, which is what the kind says.
- **Color by effect, with the kind on the label only.** The owner settled kind by color and effect
  by decoration. Color by effect would also paint the in-process mass in three colors that say
  nothing about how it travels.
- **Crossbars across the body for a mutation.** A mark across the line needs a clear straight
  stretch to sit on, and a 7px bar vanishes at the opening zoom of Packages. The head is on every
  line and needs no placement.
- **Dashed and dotted bodies for query and compute.** The owner: "Dashes / dots make busy
  diagrams harder to follow, so use sparsely." The head and the caller's ring carry the effect,
  and only declared-only keeps a broken body.
- **A head that the kind sets** (an open head for `event` and `queue`). It put a mark of the
  kind on the line's shape, against the rule that the kind is the color.
- **Motion that plays always**, such as gradients that drift toward the target. At the opening
  zoom everything crawls, it cannot be told from authored traffic, and an export has no motion,
  so the still marks must carry the meaning anyway.
- **A line that joins kinds or effects, in the ink of its majority or as two rails.** It claims a
  pair that no relationship of the line has, such as an amber solid line for an async mutation
  that never happened. Separate lines say each pair.
- **`data-read` and `data-write`.** They put the read and write axis on stores only. A lens of
  changes would then miss every HTTP or RPC call that changes state.
- **A table of the effects each kind allows**, such as "an event always mutates" or "a spawn always
  mutates". The same kind spans all three effects here: one Git command reads blobs, a `dot`
  process lays a graph out, and a detached process starts a server. The store would also need to
  know whether a vault had redefined a built-in id.
- **No built-in store kind, with each vault defining its own.** Every vault with a database would
  invent a word, and the part kinds `datastore` and `cache` of a fresh vault would have no true
  kind to reach them.
- **Keeping the name `data`.** It invited "data passes", as 25 of 34 relationships here show.
- **A ban on an effect for a dependency.** Owner decision 26 says that a dependency may omit it,
  which narrows nothing else.
- **Refusing to read an old vault.** A person who updates Archboard could no longer look at the
  model, and the agents who classify it could not read it. Retained history needs the old reading
  anyway.
- **One error for each relationship without an effect.** In the current format the schema leaves
  none to report. In the old format the inventory lists them, so one diagnostic is enough.
- **A default effect in the upgrade.** It would bring back the unclassified relationship under
  another name.
- **A check on a share of plain calls, or a finding on calls that mutate** (`CALLS_MUTATING`). The
  rule tells an author to write `mutation` in doubt, and a finding would then question the author
  for following it. The upgrade's list of gaps does that job once, when somebody can act on it.
- **A dash-dot line for mixed effects.** Lines now join one effect only, so a line never mixes
  them.
- **The kind's color kept under a comparison, with a status mark beside the label.** It redraws
  every compared line, and the decoration already says the effect under a standing color.

## Consequences

- Every vault upgrades. Until it does, it reads and refuses every write.
- The examples, the site's model and this repository's vault are upgraded in TASK-663.04 and
  TASK-663.07, and again from `call` to `sync` and `async` in TASK-663.12.
- A picture of an old checkpoint looks as it did when it was retained.
