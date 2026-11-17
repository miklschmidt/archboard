---
status: accepted
---

# Existence is a fact about a variant, never about a node

Canonical proposal states supersede board-owned variants below. Unbuilt subjects remain proposed, and a planning model can have no current designation.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Archboard was scoped to code that exists. README.md:19-21 says it is for
understanding an existing system, and the runbook in the `archboard` skill reads
source at every step. ADR 0023 and the node schema contemplated planned nodes.
The boundary was never stated, so the two stood side by side.

The user decided on 2026-09-18 that planning is in scope. An author can draw an
architecture that nobody built. This decision says where that fact lives.
TASK-270 tracks the decision.

Today a board that planning authored is indistinguishable from documentation of
code that exists. This holds in the document and in the picture. Both paths open
to the author are wrong.

If the author binds the intended paths, `archboard check` reports
`BINDING_PATH_MISSING`. That code offers two repairs: "bind it where the code
lives now, or remove the binding". Neither repair says "this is planned".

If the author leaves the paths unbound, as the runbook instructs, the board says
nothing at all. The renderer never reads `binding`, so a bound part and an
unbound one draw identically.

## Decision

Existence is a fact about a variant, and never about a node. A board for
something nobody built carries a draft variant and no current one.

The variant already carries this meaning, and it carries it for every subject at
once. A draft is a proposal about an architecture rather than a description of
one. The store derives the standings that the renderer draws on a draft, added
and unchanged. An agent never authors them
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md)).

"Nobody has built this" is not a property that some parts of a proposal have and
others lack. It is what the whole proposal is. Saying it once, about the
variant, is saying it exactly as often as it is true.

A board can therefore carry no current designation. The designation becomes
optional, and a board can be created without one. Its absence is not a defect
to repair. It is the board saying that nothing it describes is built yet.

## Why a per-node marker was rejected

Three reasons exist, and any one of them is sufficient.

The node has nowhere to put the marker, deliberately. The schema refuses
`status`, `planned`, `exists` and `lifecycle` on input today. Of course,
somebody can add a tenth field. The reasons not to add one are the next two.

The picture has nowhere to say it. Every visual channel is already allocated
([ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md)).

The one channel left is the one that comparison status already takes. Comparison
status overrides the semantic border on nodes and the line color on edges (ADR
0025). A "planned" marker has only one channel to draw itself in, and that
channel already draws "added". On a draft, those are the same claim made twice.
On the current variant, the marker is a contradiction that the board itself
invites. A node says that it does not exist inside the architecture that the
board says is implemented.

A per-node marker is a second, authored answer to a question that the store
already derives. Only the authored answer can go stale. None of the sixteen
default node kinds says whether a thing is. Each says only what it is. That is
not an oversight.

Kind answers "what is this part", and lifecycle answers "is this architecture
built". They are different questions asked at different scales. A per-node
marker splits existence in two. One part is a claim that an author maintains by
hand on every node. The other is a fact that the store computes for the whole
variant. ADR 0023 closed precisely this split. It ruled that agents never author
change flags. The per-node version must additionally be un-marked, node by node,
on the day the thing ships.

Absence of a `binding` cannot carry the meaning either. This is not a fourth
reason. It is the reading that somebody will reach for. The product already
refuses that reading in terms. A node with no binding can be implemented and not
bound yet. An unbound node means that nothing is bound to it. It never meant
that nothing was built.

## What this supersedes

Earlier statements in the record put existence on a node, or define the current
designation or adoption as though every board had one. This decision supersedes
them, and CONTEXT.md is edited in the same change.

[ADR 0030](0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md)
refuses to shelve the current variant, because "a board with no current
architecture is not a board". The refusal stands, but its reason does not. A
board can have no current architecture, and a board for unbuilt work is exactly
that. A board cannot lose the current architecture that it has. Shelving the
current variant takes a board that said what was built and leaves it saying
nothing, with only a shelving reason to explain why. The refusal code is
unchanged.

## Consequences

- Adoption is the moment a planned board's architecture starts existing.
  Nothing becomes historical, because nothing was current.
- A root draft still has no predecessor, so there is nothing to compare it
  against, and that is correct rather than a gap. A board for unbuilt work is
  not a proposal relative to anything. It describes something that is not there.
  What tells a reader so is the board's own lack of a current variant. TASK-270
  therefore requires that lack to be visible in the pane and in the drawing.
- A binding on a draft is ahead of the code, not behind it, and the checker
  judges a binding by the variant it is on (decided in TASK-270). Only the
  current variant says that its architecture is built. Only there does a path
  that is not in the checkout mean that the binding went stale. Only there does
  `BINDING_PATH_MISSING` report it.

  On a draft, a path that does not exist yet is where the proposal says the code
  will live. The checker says nothing about it, as it says nothing about the
  binding of a historical variant. The check applies from the moment adoption
  makes the variant current. At exactly that moment, the variant starts claiming
  that the code is there.

  Deciding that it is always wrong was rejected. A planning author can then bind
  nothing, and must learn every intended path again at adoption. A warning of
  its own was rejected too. Every bound part of every correct planning board
  will warn on every check. A clean check is then unreachable for right work,
  and a warning stops meaning anything.

  The cost is that a mistyped path on a draft is not reported until adoption.
  `BINDING_PATH_MISSING` gains the repair that does not assume staleness. A part
  whose code is not written is a proposal, and it belongs on a draft, not on the
  current variant.

- A board's bare name still opens something, and asking which variant is
  implemented still answers nothing (decided by the user on 2026-09-23). An
  address that names no variant opens the current variant. If a board has none
  and exactly one draft exists that no other draft came before, the address
  opens that draft. That case covers the sole draft. Otherwise the address is
  refused, and the refusal names the candidates.

  That default is an addressing rule. It applies where nobody said which
  variant. `currentVariant` and `resolveVariant` keep answering which variant is
  implemented. These therefore all still find none: a drill-down that asks for
  the current variant, an adoption, a shelving and the agent brief's account of
  the implemented architecture. Naming `current` explicitly asks the second
  question. On such a board, that name is refused as having no current variant.

- Creation says whether the architecture exists. A board is created with a
  current variant, unless its creation input says `"lifecycle": "draft"`. In
  that case, its first variant is a draft and the board designates nothing.
- Older builds refuse a board with no current variant rather than misread it.
  This is for the reason that ADR 0030 gave for the fourth lifecycle. The
  contract is strict, so a document that misses a field that an older build
  requires fails its parse.

  The contract version moves to `2.4.0` as a record of the change, not as a
  guard. A major is for moving or reinterpreting a field. Making `current`
  optional changes nothing for a document that carries one.

  The store's registered migration from `2.3.0` keeps content as it is. Each
  board is therefore written once more, on its next read. That write is one new
  board version whose only change is the contract version.

## Amendment: a picture drawn against a named variant (2026-10-15)

The user decided on 2026-10-15 that a stacked pull request is drawn against the
pull request below it, without the "Planned" frame (TASK-478.01). Until then,
every picture of a board with no current variant carried the frame. A pull
request that builds code was therefore drawn under "nothing on this board is
built", and a picture on a built board marked everything the pull requests below
it added.

A picture drawn against a named variant (`--against`) is read relative to that
variant. It marks what the drawn variant adds, changes and removes over that
variant, and it carries no frame. The frame says that the whole board is
unbuilt. A picture relative to a named variant says nothing about that, and the
variant it is read against may be unbuilt too.

This is not a second way to say that something is built. The frame is still
drawn from the board, and a picture without `--against` is drawn as before. The
frame goes only when the caller names what the picture is relative to. For a
reviewer, that is the base branch.
