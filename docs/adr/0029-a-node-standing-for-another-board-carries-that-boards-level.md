---
status: accepted
---

# A node standing for another board carries that board's level

`external` had been carrying two jobs. The skill defines it as a part outside
the checkout — a library, a shell, a caller — while archboard's own vault used
it to join one board to another: 14 of the 18 `external` nodes in
`.archboard/vault` carried a `drillDown` and named a part of this codebase.
The vault was inconsistent with itself as well, because links pointing down
already used the target's own nature (`Canvas server` is `service`, `Semantic
board store` is `module`). Authors read the ambiguity the other way round: in
the 2026-09-17 evaluation batch, 3 of 6 runs on the same scenario modelled
third-party packages as `package` rather than `external`. This decision,
accepted in TASK-255 on 2026-09-17, settles what each kind says.

Kind, level, drill-down, card and container are defined in
[CONTEXT.md](../../CONTEXT.md). The decisions below govern which kind an author
chooses and where a drill-down may sit.

## `external` is third-party code

`external` means code this codebase does not own: a library, a framework, a
runtime, a shell, a hosted service, a caller outside the checkout. It is the
kind for a boundary the team cannot edit, and its neutral appearance is there
to say "outside" at a glance.

It is not the kind for a part of this codebase that a reader reaches through
another board. A board in the vault is not external to the vault, and a node
that says `external` about our own service tells the reader the opposite of
what is true.

## Standing for a board is saying its level

A node that stands for what another board describes takes that board's level
as its kind. A board at `system` is stood for by a node of kind `system`, a
`service` board by `service`, a `module` board by `module`. A reader then sees
where one level of the architecture joins the next, in the icon chip, without
opening anything.

So the vocabulary must offer a kind for every level it configures. The default
vocabulary now defines `system` alongside `service` and `module`; a vault that
configures its own levels defines a kind of the same name for each, or it
cannot say what its own boards are.

### How this relates to the node `level` of ADR 0013

[ADR 0013](0013-a-node-records-a-level-only-to-differ-from-its-board.md) says a
node records a level only to differ from its board, and that an absent level
means the board's own. That field lives on the legacy promotion path, where a
node is element metadata; a semantic node has no `level` field at all, and none
is being added.

The rule survives in the form this decision gives it. A node at its board's
level says nothing extra: its kind describes what the part IS — a route, a
queue, a function. A node at a different level says so, and the way it says so
is the kind it carries, because the only nodes that sit at another level are
the ones standing for another board. One field, read the way ADR 0013 reads
the other: silence means "same as the board", and there is nothing to keep in
step.

## A drill-down is an affordance, never a node

A drill-down is an affordance on a part that is really there. A node added only
to carry a link is a button, and a diagram has no buttons: it costs a card, a
lane and a reader's attention to say something the board does not mean.

A board must therefore show its actual callers. When those abstract to a
different system, that abstraction is the node — it is a real participant with
a real relationship, and its drill-down is one of its properties. When they do
not, the link has no node to sit on, and the board says so by not drawing one.

Which way the link points decides where it sits:

- **Up** — to the board one level coarser, the one this board is a part of —
  belongs on a container, never on a card standing beside the parts. The
  container is the whole this board describes; opening the board that contains
  it is a property of that whole.
- **Down or sideways** belongs on a card: a module board that shows `calls this
module` draws an edge to a node whose kind is `module` and whose drill-down
  opens it.

## Considered and rejected

A dedicated `link` or `board` kind. Rejected because it is the button again,
under a name that admits it: a kind whose whole meaning is "there is another
board" describes nothing in the architecture, and a reader learns from it only
that somebody wanted a link here.

Keeping `external` for both jobs and telling them apart by the presence of
`drillDown`. Rejected because the kind is what a reader sees. Two nodes drawn
identically, one meaning "outside this codebase" and one meaning "ours, one
level up", is a picture that lies at a glance and is corrected only by clicking.

Adding a `level` field to the semantic node so a standing-for node could keep a
descriptive kind and record its level beside it. Rejected because it duplicates
what the drill-down target already knows, can go stale against it, and would
make the level a thing readers must inspect rather than see.

## Consequences

- The default vocabulary gains a `system` node kind, so every default level has
  a kind that can stand for it.
- The vault checker reports three things it did not: a node that exists only to
  carry its `drillDown` (no relationships, no children, in no flow), a
  `drillDown` naming a board the vault does not hold, and a kind that disagrees
  with the level of the board it opens. They are warnings, because the board
  stays readable and a repair is an ordinary agent write
  ([ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md)).
- The migration of `.archboard/vault` is not a rename. Several of its cards
  exist only to point up (`Archboard system`, `System overview`, `Workbench
subsystem`), and the boards holding them need their real caller drawn or the
  link moved onto a container. TASK-257 owns that rewrite.
