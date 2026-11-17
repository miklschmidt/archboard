---
status: accepted
---

# Existence is a fact about a variant, never about a node

[ADR 0067](0067-active-proposals-store-identity-changes.md) and
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replace
board-owned variants with canonical proposal states. The decision carries over:
unbuilt subjects stay proposed, and a planning model can have no current state.

Archboard was scoped to code that exists. The user decided on 2026-09-18 that
planning is in scope. An author can draw an architecture that nobody built.
This decision says where that fact lives.

## Decision

Existence is a fact about a variant, and never about a node. A board for
something nobody built carries a draft variant and no current one.

A draft is a proposal about an architecture rather than a description of
one. The store derives the standings that the renderer draws on a draft, added
and unchanged. An agent never authors them
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md)).

"Nobody has built this" is not a property that some parts of a proposal have and
others lack. It is what the whole proposal is. Saying it once, about the
variant, is saying it exactly as often as it is true.

A board can therefore carry no current designation. Its absence is not a defect
to repair. It is the board saying that nothing it describes is built yet.

## Why a per-node marker was rejected

The picture has nowhere to say it. Every visual channel is already allocated
([ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md)).
The one channel left is the one that comparison status already takes. On a
draft, "planned" and "added" are the same claim made twice. On the current
variant, the marker is a contradiction: a node says that it does not exist
inside the architecture that the board says is implemented.

A per-node marker is a second, authored answer to a question that the store
already derives. Only the authored answer can go stale. ADR 0023 ruled that
agents never author change flags. The per-node version must also be un-marked,
node by node, on the day the thing ships.

Absence of a `binding` cannot carry the meaning either. A node with no binding
can be implemented and not bound yet. An unbound node means that nothing is
bound to it. It never meant that nothing was built.

## What this supersedes

[ADR 0030](0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md)
refuses to shelve the current variant, because "a board with no current
architecture is not a board". The refusal stands, but its reason does not. A
board can have no current architecture. A board cannot lose the current
architecture that it has.

## Consequences

- Adoption is the moment a planned board's architecture starts existing.
  Nothing becomes historical, because nothing was current.
- A binding on a draft is ahead of the code, not behind it. Only the current
  variant says that its architecture is built, so only there does a path that
  is not in the checkout mean that the binding went stale. The check applies
  from the moment adoption makes the variant current.

  Deciding that it is always wrong was rejected. A planning author can then bind
  nothing, and must learn every intended path again at adoption. A warning of
  its own was rejected too. Every bound part of every correct planning board
  will warn on every check, and a warning stops meaning anything. The cost is
  that a mistyped path on a draft is not reported until adoption.

- Addressing and existence are separate questions. An address that names no
  variant opens the current variant, or the sole root draft of a board with
  none. Asking which variant is implemented still answers nothing on such a
  board.
- A picture drawn against a named variant says nothing about whether the board
  is built, so it carries no "Planned" frame.
