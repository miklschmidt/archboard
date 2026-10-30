---
status: accepted
---

# A container's interface is what relationships from outside it reach

Accepted on 2026-10-06 for TASK-368.01 after an independent review. It
serves TASK-368 and its subtasks TASK-368.02 to TASK-368.11, and Proposal 2 of
the [design checks](../design/design-checks.md).

ADR 0059 (TASK-537.02) amends the section on pass-through entry points: a
design question that a person chose can light a pass-through entry point.

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
decides the drawing. A view that shows the children draws the node expanded
around them. A view that shows the node alone draws it as a card, and the node
keeps its interface.

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
The renderer uses the same rule to carry a line into and out of containers
(`project` and `between` in
`packages/renderer/src/shared/rules/blocks/tree/tree.ts`).

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

So a pass-through entry point is a question for the reader, never a fault. It
is the part that the deletion test asks about first. Delete it and connect its
callers to the part it calls. If only a line is lost, it was a pass-through.
Its description and its code answer the question.

An entry point with children is never a pass-through, because it holds parts of
its own. Its own interface answers for them.

A pass-through entry point has no mark of its own in the picture. Every visual
channel is taken (ADR 0025), and the picture already shows the shape: an entry
point with one line onward. A design question that a person chose can light it,
as attention and not as a mark (ADR 0059). It shows in words wherever the interface is listed:
in the answer of `semantic inspect`, beside the measures of competing proposals
and in the pane inspector. It is reported as information, never as a warning.

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
deepest module there is. Browser client on the board Browser application is
such a container today: it has 19 children and no caller on its board.

This keeps one rule for every container: a child that nothing from outside
reaches is a hidden part. The note is the empty list of callers, said in words.
It is not a third kind of child and not a state of its own. An answer of "no
interface" for such a container is the answer for a node with no children, and
the two are different facts.

### Derived, never authored

The interface is derived and never authored (ADR 0031). No node has a field
that says it is an entry point or a hidden part, and no container lists its
interface. The relationships already say who reaches what. An authored list is
a second answer, and only the authored answer can go stale.

The derivation is a pure function of the content of one variant. It reads the
whole variant before any view narrows it, as `inspectGroup` and
`compareVariants` do. A view that hides a caller is a narrower picture, not a
smaller interface. The derivation lives in the shared model, beside
`inspectGroup` in `src/shared/semantic-board/lib/`. The CLI, the pane
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

- **Module** is a container. A module in codebase-design has any scale, from a
  function to a slice across tiers. On a board, only a node with children has a
  derived interface. The inside of a card is on the board it drills into,
  if there is one, and that board derives its own interface. Archboard does not
  use "module" as a term, because it is also a common level and a common kind
  in a vault's vocabulary.
- **Interface** is the interface: the entry points. This is the largest
  difference. In codebase-design, an interface is everything a caller must
  know: types, invariants, ordering, errors, configuration and performance. The
  interface of a board says only which parts callers reach. The rest is in the
  descriptions, the relationship labels and the code. That is why the measures
  give no verdict. What the code exposes is the part of codebase-design's
  interface that the code check can read.
- **Implementation** is the hidden parts, together with what is inside them and
  inside the entry points.
- **Seam** is where relationships enter and leave a container. In
  codebase-design, a seam is a place where behaviour can change without an edit
  there, and that needs something that varies across it. A board cannot see
  whether anything varies. So a container shows where a seam is, not whether it
  is real. Archboard adds no term for it. "Boundary" stays the word for a
  group's edge (CONTEXT.md), and codebase-design avoids that word.
- **Depth** has no measure. Depth is the behaviour a caller gets for each unit
  of interface it learns, and a board does not hold behaviour. A ratio of
  hidden parts to entry points is the board's form of the line ratio that
  codebase-design rejects. It rewards drawing more hidden parts. A reader
  judges depth from the measures and the descriptions. The glossary also keeps
  "depth" out, because the entry for Level avoids it.
- **Caller** is the same word with the same meaning, for every relationship
  kind.
- **Pass-through** (Ousterhout, and the deletion test) is the pass-through entry
  point: Ousterhout's pass-through method, read from the shape of the board.
  His pass-through variable is a fact of the code, and TASK-368.11 reads it
  from Terraform.
- **Adapter** and **locality** have no term here, and neither has what callers
  get from depth. The history lens reads locality from commits (ADR 0045).

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
- Only the relationships that the part receives from outside the container
  count for the kind rule. A part that takes one kind from outside and another
  from a sibling does more than pass one call on. The rule also gets one more
  condition for no gain: on the measured variants, it marks the same 5 parts.
- A mark in the picture. No visual channel is free (ADR 0025), and a mark
  states as a fact what the board can only ask.
- An authored flag, for the reason in ADR 0031.

### The name of the measures

- Scorecard. It already means how a drawing reads.
- Depth, or a depth score. The entry for Level avoids "depth", the word implies
  a verdict, and codebase-design rejects depth as a ratio.
- An interface score. One number invites a ranking that the board cannot
  support.
- Footprint. The history lens uses it for the parts that a branch changed
  (ADR 0045).
- Report. A pane's report is what the pane tells the server (ADR 0023).

### Other names

- Declared interface for the code's side, as the language table of the design
  note says. Then "interface" has two meanings, and a finding that holds one
  against the other compares the interface with the interface.
- Drawn interface for the board's side, as the title of TASK-368.10 says. The
  interface does not depend on a drawing. It is the same in every view of the
  variant.
- Crossings for the relationships that enter and leave a container, as the
  title of TASK-368.02 says. A crossing is where two lines of a drawing cross,
  one of the measures of the scorecard.

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

- TASK-368.02 writes the one derivation, beside `inspectGroup`. Its answer
  lists the entry points, the hidden parts, the callers, the outgoing
  relationships, the pass-through entry points and the relationships that end
  on the container itself. Its tests own nesting, a relationship to the
  container itself, a container with no outside caller and the pass-through
  rule. The answer says callers and outgoing relationships where the title of
  the task says crossings.
- TASK-368.03 teaches the consumer skill that a relationship to a container
  makes no entry point, and is only for a whole-module dependency. A board that
  describes a module draws the callers of the module outside it. Otherwise the
  board says nothing about the interface.
- TASK-368.06 puts interface changes first, reads them against the same
  variant as the rest of the comparison, and changes no comparison status.
- TASK-368.07 reports the five counts for each variant. It combines them into no
  score and ranks no proposal.
- TASK-368.08 reads the interface of the variant, not the lines a view draws.
  So an entry point keeps the first row in a view that hides its caller. A
  removed child that a comparison restores is not in the content of the
  variant, so it is never an entry point. This applies to the architecture
  grammar only.
- TASK-368.09 names pass-through entry points in words in the sidebar, and the
  canvas draws no mark for them.
- TASK-368.10 derives the interface of the variant that it reads with this one
  derivation, and calls the code's side what the code exposes.
- TASK-368.11 reports a Terraform module's variables and outputs as what the
  module exposes, not as its interface.
- TASK-368.11 can call a Terraform module shallow, because there the code
  proves it: the module wraps one resource and passes each variable through.
  That finding reads the code, and it is information. The interface measures
  of a board never say shallow, because a board does not hold behaviour.
- CONTEXT.md gains entry point, hidden part, interface, caller, pass-through
  entry point and interface measures. Its Container entry names the node with
  children, and no longer only the expanded drawing of it. Its Comparison
  entry stays as it is.

## Amendment of 2026-10-06: a shallow Terraform module may have a count toggle

TASK-368.11 and its review amended the shallow rule in Consequences. Everything
else stands.

A Terraform module is shallow when it manages exactly one resource, calls no
module, and passes every variable through. One more variable is allowed: a
variable that only sets the `count` of that resource. Every
terraform-aws-modules wrapper has such a `create` variable. Under the rule as
first written, none of them was shallow. A caller can write the same toggle as
`count` on the module call, so the toggle makes the module no deeper.

A variable in `for_each` does not count as a toggle. It carries data into the
resource's arguments through `each.value`, and no reference shows that. A
module whose resource reads a local or a data source is not shallow, because
the module decides that argument for its callers.

One case reads as shallow without being shallow. A literal argument such as
`block_public_acls = true` makes no reference. So a wrapper that fixes a
setting to a constant still reads as shallow.

## Amendment of 2026-10-07: tests respect a module's public entry files

TASK-436.05 applies the module boundary to tests as well as callers. A test
inside the directory of a module can import any file of that module. A test
outside it uses the module's public entry files, as callers do. An external
test that imports a private file gets `TEST_IMPORT_UNEXPOSED`, a warning on
the container that names the test, the private file and the import's line.
It applies even when the board draws no caller of the container.

Tests exercise code; they are not callers of the product. A use by a test
never makes an exposed name used, and a name only tests use still gets
`EXPOSED_UNUSED`. A public entry file can re-export a definition from a
private file. That exposes the name through the entry file and leaves the
private file private.

## Amendment of 2026-10-07: flake outputs and chart values are exposed names

TASK-436.08 adds two rules to the code's side of the interface check. A Nix
flake exposes the output attribute paths that `flake.nix` defines. A Helm
chart exposes the key paths that `values.yaml` defines, with dots between
nested keys. The chart's `Chart.yaml` identifies it. A directory, `flake.nix`,
`Chart.yaml` or `values.yaml` can bind a container to these modules.

The existing interface findings apply to these names and the parts that
own their definitions. A chart's templates and the manifests they define
remain private; they are not its values. An expression the facts reader
cannot follow stays skipped, as ADR 0046 requires. Neither reading stores
a default value in a fact or quotes one in a finding.

A compose file and a plain Kubernetes manifest declare no interface that
this rule can read. A container bound to one, or to its directory, still
gets `exposure-unknown`. This is a skip, not a claim that it exposes no names.
