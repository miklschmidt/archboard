---
status: accepted
---

# A container's interface is what relationships from outside it reach

[ADR 0082](0082-the-code-check-judges-module-depth-from-the-code.md) supersedes one claim below,
that depth has no measure. A board holds no behaviour, but the code does, and the code check now
judges module depth from it. The interface measures of a board still give no verdict.

## Context

A deep module hides a lot of behaviour behind a small interface (Ousterhout,
and the `codebase-design` skill). A board cannot show that today. It has
containment and relationships, but nothing says which children of a container
its callers use and which children are hidden. The design checks measured the
dogfood boards on 2026-09-29. 37 of the 202 relationships that cross a code
module ended on a part bound to a private file of another module.

[ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)
refuses an authored answer to a question that the store can derive. A board
already says who reaches what, because that is what its relationships say. So
the interface needs no new field. This decision says how the store derives it,
and what the derived facts are called. The rules below say variant where the
canonical model says state.

## Decision

### Terms

A container is a node that has children on the variant. The interface belongs
to the node on the variant, not to a drawing of it.

If a relationship ends on a child or on a part inside the child, it reaches
the child.

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
child that holds its end. Each container answers for its own children. So entry
points and hidden parts divide the children of a container between them.

Every relationship counts, whatever its kind. A vault names its own kinds (ADR
0024), so a rule that keeps some kinds and leaves others needs a key in the
configuration. A data read, an event and an import also make the source depend
on the part that they reach. So the derivation names no kind.

Only relationships count, and flow steps do not. A flow holds returns that
travel back against the dependency. Otherwise a return from an outside part
makes the part that it returns to an entry point.

### A relationship ends on the part that owns it

The owner decided that a relationship that reaches a container with parts is
always a bug or badly authored data. `archboard check` fails on such an end with
`RELATIONSHIP_ON_CONTAINER`. It is an error of the semantic check, because a
code finding cannot be an error, and the rule reads only the model. It judges
current architecture, so a draft that inherits such an end passes until a
reconciliation settles it. The one exception joins a module to a part that it
holds. That relationship does not enter or leave the module.

The derivation still counts such an end, because a retained reading or a draft
can hold one. It makes its source a caller and makes no entry point, because it
names no child.

### A pass-through entry point

A pass-through entry point is an entry point with no children that sends
exactly one relationship, of the same kind as every relationship it receives.
It is how a board shows Ousterhout's pass-through method: a part that takes a
call and passes the same call on.

The kind of a relationship names its mechanism, and two kinds compare exactly.
A label is free text, and the derivation cannot compare two labels. A part that
receives one kind and sends another changes the mechanism, as an adapter does.
An entry point with children is never a pass-through, because its own interface
answers for its parts.

So a pass-through entry point is a question for the reader, never a fault. It
has no mark of its own in the picture. Every visual channel is taken (ADR 0025),
and the picture already shows the shape: an entry point with one line onward.

### The interface measures

The measures are counts, and the answer lists the parts and relationships
behind each count. They are read off one container on one variant. They are
never combined into one number, and they give no verdict such as deep or
shallow.

They are not part of the scorecard
([ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md)). The
interface measures are the same for every drawing of a variant. A renderer
change can move the scorecard and never moves them.

### Derived, never authored

The interface is derived and never authored (ADR 0031). No node has a field
that says it is an entry point or a hidden part, and no container lists its
interface. The relationships already say who reaches what. An authored list is
a second answer, and only the authored answer can go stale.

The derivation is a pure function of the content of one variant. It reads the
whole variant before any view narrows it. A view that hides a caller is a
narrower picture, not a smaller interface. The CLI, the pane inspector, the
renderer and the comparison read this one function. Nothing stores its result.

**Comparison.** The comparison reports interface changes before the other
changes, because an interface change costs every caller and an implementation
change costs one module. An interface change never changes a comparison status,
so a badge never spreads to a neighbour.

**History.** The interface of a historical variant is derived from its frozen
content. Nothing is recorded at adoption. So an improved derivation changes its
answers for history too, as a renderer improvement redraws history.

**The code check.** The code check
([ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md))
holds the interface of a variant against what the code exposes, with this one
derivation. The word "interface" alone means the interface that a board
derives, and "exposed" names the code's side. A test inside the directory of a
module can import any file of that module. A test outside it uses the module's
public entry files, as callers do. Tests exercise code and are not callers of
the product, so a use by a test never makes an exposed name used.

### The codebase-design vocabulary

The interface is narrower than the interface in codebase-design. There, an
interface is everything a caller must know: types, invariants, ordering,
errors, configuration and performance. The interface of a board says only which
parts callers reach. That is why the measures give no verdict.

Depth has no measure. Depth is the behaviour a caller gets for each unit of
interface it learns, and a board does not hold behaviour. A ratio of hidden
parts to entry points is the board's form of the line ratio that
codebase-design rejects. It rewards drawing more hidden parts.

## Considered and rejected

- Only siblings are outside. Then a caller in another service, which is a
  sibling of the parent, does not count. That caller is the one that an
  interface change costs most.
- Every part that a relationship reaches is an entry point of every container
  around it. Then the entry points of one container mix levels. A nested
  container that holds a reached part is neither an entry point nor a hidden
  part.
- The hidden parts count every part inside the container, at any depth. Then a
  part below a nested container counts for that container and again for every
  container around it.
- Any entry point that sends one relationship is a pass-through. On the
  measured variants that marks 14 of 29 entry points, and most of them are
  adapters that change the mechanism. The kind rule leaves 5.
- Exactly one relationship in and one out is a pass-through. A pass-through
  method can have many callers.
- An interface for each view. Then one container has several interfaces on one
  variant, and the CLI and the pane disagree about it.
- A part for every file that makes a call. Measured on every reading, it took
  the lines drawn from 1,694 to 2,605 and the readings that pass the fit gate
  from 107 to 94 of 115. A part that binds a file makes the code check ask for
  every call of that file, so the board became an import map, in which an
  architect cannot see a smell.
