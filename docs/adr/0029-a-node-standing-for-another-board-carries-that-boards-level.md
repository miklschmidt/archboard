---
status: accepted
---

# A node standing for another board carries that board's level

[ADR 0058](0058-canonical-model-reads-keep-legacy-authority-explicit.md) replaces fixed board-level navigation for authored canonical models.
The rules below still govern legacy boards until explicit migration.

`external` carried two jobs. The skill defines it as a part outside the
checkout, such as a library, a shell, or a caller. Archboard's own vault used it
to join one board to another. 14 of the 18 `external` nodes in
`.archboard/vault` carried a `drillDown` and named a part of this codebase.

The vault was inconsistent with itself as well. Links pointing down already used
the target's own nature (`Archboard server` is `service`, `Semantic board store`
is `module`). Authors read the ambiguity the other way round. In the 2026-09-17
evaluation batch, 3 of 6 runs on the same scenario modeled third-party packages
as `package` rather than `external`. This decision, accepted in TASK-255 on
2026-09-17, settles what each kind says.

Kind, level, drill-down, card and container are defined in
[CONTEXT.md](../../CONTEXT.md). The decisions below govern which kind an author
chooses and where a drill-down can sit.

## `external` is third-party code

`external` means code this codebase does not own: a library, a framework, a
runtime, a shell, a hosted service, a caller outside the checkout. It is the
kind for a boundary the team cannot edit. Its neutral appearance is there to say
"outside" at a glance.

It is not the kind for a part of this codebase that a reader reaches through
another board. A board in the vault is not external to the vault. A node that
says `external` about our own service tells the reader the opposite of what is
true.

## Standing for a board is saying its level

A node that stands for what another board describes takes that board's level as
its kind. The kind matches the level:

- A node of kind `system` stands for a board at `system`.
- A node of kind `service` stands for a `service` board.
- A node of kind `module` stands for a `module` board.

A reader then sees where one level of the architecture joins the next, in the
icon chip, without opening anything.

So the vocabulary must offer a kind for every level it configures. The default
vocabulary now defines `system` alongside `service` and `module`. A vault that
configures its own levels defines a kind of the same name for each. If it does
not, it cannot say what its own boards are.

### How this relates to the node `level` of ADR 0013

[ADR 0013](0013-a-node-records-a-level-only-to-differ-from-its-board.md) says a
node records a level only to differ from its board. It also says that an absent
level means the board's own. That field lives on the legacy promotion path,
where a node is element metadata. A semantic node has no `level` field at all,
and this ADR adds none.

The rule survives in the form this decision gives it. A node at its board's
level says nothing extra. Its kind describes what the part is, such as a route,
a queue, or a function. A node at a different level says so through the kind it
carries. The only nodes that sit at another level are the ones standing for
another board. This is one field, read the way ADR 0013 reads the other. Silence
means "same as the board", and there is nothing to keep in step.

## A drill-down is an affordance, never a node

A drill-down is an affordance on a part that is really there. A node added only
to carry a link is a button, and a diagram has no buttons. Such a node costs a
card, a lane (a passage where lines run) and a reader's attention to say
something the board does not mean.

A board must therefore show its actual callers. When those abstract to a
different system, that abstraction is the node. It is a real participant with a
real relationship, and its drill-down is one of its properties. When they do
not, the link has no node to sit on, and the board says so by not drawing one.

Which way the link points decides where it sits. An up link goes to the board
one level coarser, the one this board is a part of. It belongs on a container,
never on a card standing beside the parts. The container is the whole this board
describes. Opening the board that contains it is a property of that whole.

A down or sideways link belongs on a card. A module board that shows
`calls this module` draws an edge to a node whose kind is `module` and whose
drill-down opens it.

## Considered and rejected

A dedicated `link` or `board` kind was rejected. It is the button again, under a
name that admits it. A kind whose whole meaning is "there is another board"
describes nothing in the architecture. A reader learns from it only that
somebody wanted a link here.

Keeping `external` for both jobs and telling them apart by the presence of
`drillDown` was rejected. The kind is what a reader sees. Two nodes drawn
identically make a picture that lies at a glance. One node means "outside this
codebase" and the other means "ours, one level up". Only clicking corrects the
picture.

Adding a `level` field to the semantic node was rejected. The field was meant so
that a standing-for node can keep a descriptive kind and record its level beside
it. It duplicates what the drill-down target already knows and can go stale
against it. It also makes the level a thing readers must inspect rather than
see.

## Consequences

- The default vocabulary gains a `system` node kind, so every default level has
  a kind that can stand for it.
- The vault checker reports three things that it did not report before. The
  first is a node that exists only to carry its `drillDown` (no relationships,
  no children, in no flow). The second is a `drillDown` naming a board the vault
  does not hold. The third is a kind that disagrees with the level of the board
  it opens. The checker reports them as warnings, because the board stays
  readable and a repair is an ordinary agent write
  ([ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md)).
- The migration of `.archboard/vault` is not a rename. Several of its cards
  exist only to point up (`Archboard system`, `System overview`,
  `Workbench subsystem`). The boards holding them need their real caller drawn
  or the link moved onto a container. TASK-257 owns that rewrite.
