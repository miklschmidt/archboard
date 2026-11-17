---
status: accepted
---

# A container's interface is what relationships from outside it reach

Accepted on 2026-10-06 for TASK-368.01 after an independent review.

## Context

A deep module hides a lot of behaviour behind a small interface (Ousterhout,
and the `codebase-design` skill). A board cannot show that today. It has
containment and relationships, but nothing says which children of a container
its callers use and which children are hidden. The design checks measured the
dogfood boards on 2026-09-29. 37 of the 202 relationships that cross a code
module ended on a part bound to a private file of another module. 9 of the 15
boards drew no container.

[ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)
refuses an authored answer to a question that the store can derive. A board
already says who reaches what, because that is what its relationships say. So
the interface needs no new field. This decision says how the store derives it,
and what the derived facts are called.

Measured on 2026-10-06 in `.archboard/vault` and `examples/web-shop`, on the
variant that each board's bare name opens. That is the current variant, or the
first draft of Recommendations, which has no current variant. 9 nodes have
children, 6 in the dogfood vault and 3 in the example. None of them is inside
another node with children. In no variant of either vault does a relationship
start or end on a node with children. So the rules for nesting and for a
relationship to a container itself serve states that the model allows and the
consumer skill describes. The vaults do not show them yet.

## Decision

### Terms

A container is a node that has children on the variant. `CONTEXT.md` defined a
container as the expanded drawing of such a node. This decision widens the
entry to the node itself. The interface belongs to the node on the variant,
not to a drawing of it.
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) still
decides the drawing.

If a relationship ends on a child or on a part inside the child, it reaches
the child. A part sends the relationships that start on it, and it receives the
relationships that end on it.

- An **entry point** is a child of a container that a relationship from outside
  the container reaches.
- A **hidden part** is a child of a container that no relationship from outside
  the container reaches.
- The **interface** of a container is its entry points.
- A **caller** is a part outside a container where a relationship into the
  container starts. A caller counts once, however many such relationships it
  sends.
- The **outgoing relationships** of a container start inside it and end outside
  it.
- A **pass-through entry point** is defined below.
- The **interface measures** are five counts: entry points, hidden parts,
  callers, outgoing relationships and pass-through entry points.

### What is outside a container

The inside of a container is the container itself and every part below it, at
any depth. Every other part is outside: a sibling, the container's parent, a
sibling of the parent, and every part in another branch of the containment.

A relationship enters every container whose inside holds its end and not its
start. It leaves every container whose inside holds its start and not its end.

An entry point is always a child of the container, never a part deeper down. A
relationship from outside that ends deeper down makes an entry point of the
child that holds its end. Take a container C with a child D, and a part d1
inside D. A relationship from X, outside C, to d1 enters C and D. D is an entry
point of C, and d1 is an entry point of D. Each container answers for its own
children. A nested container has an interface of its own.

So entry points and hidden parts divide the children of a container between
them. Every child is one of the two.

A part inside a nested container that reaches up stays inside. A relationship
from d1 to another child c2 of C, or to C itself, leaves D and does not leave
C. It is an outgoing relationship of D. It makes no entry point of C, because it
never comes from outside C.

Every relationship counts, whatever its kind. A vault names its own kinds (ADR
0024), so a rule that keeps some kinds and leaves others needs a key in the
configuration. A data read, an event and an import also make the source depend
on the part that they reach. A change to that part costs the source. So the
derivation names no kind. Only the pass-through rule compares two kinds, and it
asks only whether they are the same.

Only relationships count, and flow steps do not. A flow step is one message in
an ordered exchange between parts, and a flow holds returns that travel back.
The consumer skill draws a return as a step, not as a relationship. Otherwise a
return from an outside part makes the part that it returns to an entry point.

A caller is the part where the relationship starts, as the variant states it.
It is not the container around that part. A caller can be the container's own
parent.

### A relationship that ends on the container itself

If its source addresses the whole module, the consumer skill allows a
relationship to end on a container. It is a dependency drawn at a higher level,
and it names no part inside.

Such a relationship makes its source a caller of the container. It makes no
entry point, because it names no child. The derived answer lists it apart, so a
reader sees a caller that reaches no entry point. It is not a warning. The
store cannot tell a whole-module dependency from a call that belongs on a
child. Only the code can.

For the container's own parent, the same relationship ends on a child. So if
the source is outside the parent too, the container is an entry point of its
parent.

A relationship that starts on the container itself and ends outside it is an
outgoing relationship of the container. A relationship between a container and
a part inside it does not enter or leave the container, so it changes none of
its measures.

### A pass-through entry point

A pass-through entry point is an entry point with no children that sends
exactly one relationship, of the same kind as every relationship it receives.
It is how a board shows Ousterhout's pass-through method: a part that takes a
call and passes the same call on.

A board shows the shape of a part, not what its body does. On the variants
measured above, 14 of the 29 entry points send exactly one relationship. Most of
them do work of their own. Reserve route takes an HTTP request and calls the
reservation ledger. The kind rule leaves 5 of the 29. Control camera is one of
the 5: it fits, pans and zooms, and sends one call on to Camera motion.

The kind of a relationship names its mechanism, and two kinds compare exactly.
A label is free text, and the derivation cannot compare two labels. A part that
receives one kind and sends another changes the mechanism, as an adapter does. Only a part that receives and sends one kind
can pass the same call on. Every relationship that the part receives counts,
from inside the container too. A part that takes another kind from a sibling
does more than pass one call on. On the measured variants, a rule that reads
only the relationships from outside marks the same 5 parts. A vault with one
relationship kind gets the plain rule: every entry point with no children that
sends one relationship. That is all that such a vault can say.

So a pass-through entry point is a question for the reader, never a fault.

An entry point with children is never a pass-through, because it holds parts of
its own. Its own interface answers for them.

A pass-through entry point has no mark of its own in the picture. Every visual
channel is taken (ADR 0025), and the picture already shows the shape: an entry
point with one line onward. It is reported as information, never as a warning.

### The interface measures

The measures are counts, and the answer lists the parts and relationships
behind each count. They are read off one container on one variant. They are
never combined into one number, and they give no verdict such as deep or
shallow.

They are called the interface measures. The scorecard already means every
measure a reader pays for in one drawing
([ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md)). The
interface measures are the same for every drawing of a variant. A renderer
change can move the scorecard and never moves them. The scorecard says how a
drawing reads, and the interface measures say what a board claims about a
container.

A node with no children has no interface on the variant. The answer says that
it holds no parts. It does not report zero entry points.

A container that nothing outside reaches has no entry points. Its children are
all hidden parts, because that is what the board says. The answer also says
that the board draws no caller. Then zero entry points do not read as the
deepest module there is.

### Derived, never authored

The interface is derived and never authored (ADR 0031). No node has a field
that says it is an entry point or a hidden part, and no container lists its
interface. The relationships already say who reaches what. An authored list is
a second answer, and only the authored answer can go stale.

The derivation is a pure function of the content of one variant. It reads the
whole variant before any view narrows it, as `inspectGroup` and
`compareVariants` do. A view that hides a caller is a narrower picture, not a
smaller interface. The CLI, the pane
inspector, the renderer and the comparison read this one function. Nothing
stores its result: not the board, not a variant and not an adoption.

**Drafts.** The interface of a draft is derived from the draft. A proposal
changes an interface by changing relationships and containment, never by
declaring entry points. On a board with no current variant, the interface of a
draft is the planned one. Reconciliation carries content into a draft, and the
interface follows from that content. So no reconciliation conflict is about an
interface, and reconciliation needs no new rule.

**Comparison.** The comparison derives the interface of each container on both
variants and compares the two by node identity. For each container it reports
these interface changes:

- the entry points added and removed: an entry point on one variant that is
  not a child of the container on the other
- the parts that moved between the interface and the hidden parts: a child of
  the container on both variants that is an entry point on only one
- the callers gained and lost

The interface changes come before the other changes, because an interface
change costs every caller and an implementation change costs one module. The
interface is read against the same variant as the rest of the comparison: the
current variant, the predecessor on a board with none, or the variant that
`--against` names
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md)).

An interface change never changes a comparison status. When a new caller
reaches a part, the part moves into the interface. The new relationship shows
as added, and the part keeps its own standing. A comparison status labels only
a subject whose own fields moved, so a badge never spreads to a neighbour
(`src/shared/semantic-board/lib/compare.ts`). The interface section of the
answer says what moved.

**Competing proposals.** The same derivation gives the measures of two or more
variants side by side, for design it twice. This answer marks no change and sets
no comparison status. It puts the measures of each variant beside the others.
So a comparison stays what `CONTEXT.md` says it is: the differences between two
variants. A shelved proposal keeps its content
([ADR 0030](0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md)),
so its measures stay readable beside the reason it was shelved.

**History.** The interface of a historical variant is derived from its frozen
content. To read how an adoption changed an interface, compare the historical
variant with the variant that replaced it. Nothing is recorded at adoption.
An improved derivation changes its answers for history too. A renderer
improvement redraws history in the same way (ADR 0023), and a policy change
restyles it
([ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md)). The
content stays what was true. The history lens
([ADR 0045](0045-git-history-is-read-through-bindings-on-request.md)) reads
commits through bindings and does not read the interface. This decision does
not join the two.

**The code check.** The code check holds the interface of a variant against
what the code exposes (TASK-368.10). The code check decides which variants it
reads (ADR 0046). Whatever variant it reads, it derives the interface with this
one derivation.

The word "interface" alone means the interface that a board derives. The code's
side is what the code exposes. The check holds the two against each other, so
they need two names. "Exposed" is the word that TASK-368.10 already uses for
the code's side. A Terraform module's variables and outputs are what the module
exposes (TASK-368.11). The interface is narrower than the interface in
codebase-design, and the section below says where they differ.

### The codebase-design vocabulary

The `codebase-design` skill names the principles that the interface measures
serve. Its terms map onto this decision as follows.

- **Interface** is the interface: the entry points. This is the largest
  difference. In codebase-design, an interface is everything a caller must
  know: types, invariants, ordering, errors, configuration and performance. The
  interface of a board says only which parts callers reach. The rest is in the
  descriptions, the relationship labels and the code. That is why the measures
  give no verdict. What the code exposes is the part of codebase-design's
  interface that the code check can read.
- **Depth** has no measure. Depth is the behaviour a caller gets for each unit
  of interface it learns, and a board does not hold behaviour. A ratio of
  hidden parts to entry points is the board's form of the line ratio that
  codebase-design rejects. It rewards drawing more hidden parts. A reader
  judges depth from the measures and the descriptions.

## Considered and rejected

### What is outside

- Only siblings are outside. Then a caller in another service, which is a
  sibling of the parent, does not count. That caller is the one that an
  interface change costs most.
- Every part that a relationship reaches is an entry point of every container
  around it. Then the entry points of one container mix levels. A nested
  container that holds a reached part is neither an entry point nor a hidden
  part. The renderer cannot put an entry point in the first row of a container
  whose child it is not.
- A relationship that leaves a nested container leaves every container around
  it. A call from d1 to c2 stays inside C, and it is part of how C works.
- The hidden parts count every part inside the container, at any depth. Then
  the entry points and the hidden parts no longer divide one set of children,
  and the count mixes levels. A part below a nested container counts for that
  container and again for every container around it. The answer lists each
  hidden part, so a reader sees a nested container among them. That container
  answers for its own parts.

### A relationship to the container itself

- It makes every child an entry point. Then one dependency drawn at a higher
  level makes the interface as wide as the implementation.
- The container is an entry point of itself. An entry point is a child, and a
  container is not part of its own interface.
- It counts for nothing. The board says that the source depends on the
  container. Dropping it loses a caller from the measures and from the
  comparison.
- It is a warning. The consumer skill allows it for a whole-module dependency,
  and the store cannot tell the two apart.

### A pass-through entry point

- Any entry point that sends one relationship. That marks 14 of the 29 entry
  points, and most of them are adapters that change the mechanism. A route that
  takes an HTTP request and calls a function is one.
- Exactly one relationship in and one out. A pass-through method can have many
  callers. The number of callers says nothing about what the part does.

### Authored or stored

- A field on a node that says it is exposed, or a list of entry points on the
  container. ADR 0031 refuses a second answer to a question that the store
  derives. An authored list can also contradict the relationships: an entry
  point that nothing reaches, or a hidden part that something reaches.
- An interface stored or cached in the note. Nothing holds a copy of a board
  ([ADR 0015](0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md), ADR
  0023). A copy that disagrees after an edit is the class of bug that ADR 0015
  ends.
- An interface for each view. Then one container has several interfaces on one
  variant, and the CLI and the pane disagree about it. A view is a way of
  reading the variant, and the variant supplies the content (CONTEXT.md).
- An interface across boards, followed through drill-downs. Each board owns its
  content (ADR 0023). The code check holds each board to the code, and the code
  is what the boards share.

## Consequences

- TASK-368.11 can call a Terraform module shallow, because there the code
  proves it: the module wraps one resource and passes each variable through.
  That finding reads the code, and it is information. The interface measures
  of a board never say shallow, because a board does not hold behaviour.

## Amendment of 2026-10-07: tests respect a module's public entry files

TASK-436.05 applies the module boundary to tests as well as callers. A test
inside the directory of a module can import any file of that module. A test
outside it uses the module's public entry files, as callers do. An external
test that imports a private file gets `TEST_IMPORT_UNEXPOSED`, a warning on
the container.
It applies even when the board draws no caller of the container.

Tests exercise code; they are not callers of the product. A use by a test
never makes an exposed name used, and a name only tests use still gets
`EXPOSED_UNUSED`. A public entry file can re-export a definition from a
private file. That exposes the name through the entry file and leaves the
private file private.

## Amendment of 2026-10-07: flake outputs and chart values are exposed names

TASK-436.08 adds two rules to the code's side of the interface check. A Nix
flake exposes the output attribute paths that `flake.nix` defines. A Helm
chart exposes the key paths that `values.yaml` defines.

A chart's templates and the manifests they define
remain private; they are not its values. An expression the facts reader
cannot follow stays skipped, as ADR 0046 requires. Neither reading stores
a default value in a fact or quotes one in a finding.

A compose file and a plain Kubernetes manifest declare no interface that
this rule can read. A container bound to one, or to its directory, still
gets `exposure-unknown`. This is a skip, not a claim that it exposes no names.

## Amendment of 2026-10-31: the canonical commands carry the answer

TASK-559.27 restores what PR 19 removed with the board commands. Everything else
stands, and the rules above keep the word variant where the canonical model says
state.

The canonical read carries `interfaceChanges` and `interfaceMeasures` in its
`comparison`, so the CLI and the reader state one derivation. `model compare`
says them first, and `--beside` adds a competing state to the measures. These
two sections are required parts of a comparison, so a forced adoption must copy
them from a fresh read with no `--beside`.

## Amendment of 2026-10-31: an author prefers the part that makes or answers a call

TASK-559.28 sharpens the guidance above. TASK-559.33 below replaces it. One
rejected repair still holds.

A first repair gave every file that makes a call a part. The owner rejected it.
Measured on every reading, it took the lines drawn from 1,694 to 2,605, the
total area from 148.5 M to 243.5 M, and the readings that pass the fit gate from
107 to 94 of 115. `Canonical checkpoint operations` went from 3 parts and 23
lines to 13 parts and 90 lines, and most of those lines were file imports named
after symbols. A part that binds a file makes the code check ask for every call
of that file, so the rule drew an import map, in which an architect cannot see a
smell.

## Amendment of 2026-10-31: no relationship ends on a module with parts

TASK-559.33 replaces the amendment above that prefers the part. The owner
decided that a connection that reaches a container header is always a bug or
badly authored data. The rules above that allow an end on a container no longer
hold, and neither does a frame end for a call that no part stands for. A
relationship ends on the part that owns it. The only exception joins a module
to a part that it holds, and `CONTAINER_LINE_TO_OWN_PART` warns on that shape.

`archboard check` fails on such an end with `RELATIONSHIP_ON_CONTAINER`. The
finding left the code check, because a code finding cannot be an error, and the
rule reads only the model. It judges current architecture, like the other
semantic errors. So a draft that inherits a frame end from its retained
predecessor passes until a reconciliation settles it. No write refuses the end.

The derivation does not change. A relationship that names a module with parts
still makes a caller and no entry point, because a retained reading or a draft
can hold one.

A group needed one change. A relationship now reaches a part of a member, so
`model inspect --group` counts it at that member. Before this change, the group
lost every such call from its boundary. A relationship between two parts of one
member crosses nothing.
