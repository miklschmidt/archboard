---
status: accepted
---

# Existence is a fact about a variant, never about a node

Archboard was scoped to code that exists — README.md:19-21 says it is for
understanding an existing system, and the runbook in the `archboard` skill reads
source at every step — while ADR 0023 and the node schema contemplated planned
nodes. The boundary was never stated, so the two stood side by side. The user
decided on 2026-09-18 that planning is in scope: an author may draw an
architecture nobody has built. This decision says where that fact lives. Tracked
as TASK-270, whose description holds the investigation this rests on, measured
through `semantic-board-store` in throwaway vaults on 2026-09-18.

Today a board authored by planning is indistinguishable, in the document and in
the picture, from documentation of code that exists, and both paths open to the
author are wrong. Bind the intended paths, and `archboard check` reports
`BINDING_PATH_MISSING`, whose two offered repairs are "bind it where the code
lives now, or remove the binding" — neither of which is "this is planned".
Leave them unbound, as the runbook instructs, and the board says nothing at all:
the renderer never reads `binding`, so a bound part and an unbound one draw
identically.

## Decision

**Existence is a fact about a variant, and never about a node. A board for
something nobody has built carries a draft variant and no current one.**

The variant already carries this meaning, and carries it for every subject at
once. A draft is a proposal about an architecture rather than a description of
one, and the standings the renderer draws on it — added, unchanged — are derived
by the store and never authored by an agent
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md):42-45).
"Nobody has built this" is not a property some parts of a proposal have and
others lack; it is what the whole proposal is. Saying it once, about the
variant, is saying it exactly as often as it is true.

**A board may therefore carry no current designation.** `current` is a required
top-level field of the document today (`src/shared/semantic-board/lib/aggregate.ts`:180)
and `createBoardTransition` hard-codes the first variant's lifecycle to
`current` (`src/runtime/semantic-board-store/lib/transitions.ts`:171-177), so a
greenfield board is forcibly labelled as the architecture that exists. Both
change: the designation becomes optional, and a board can be created without
one. Its absence is not a defect to repair — it is the board saying that nothing
it describes is built yet.

**A board with no current architecture is still a board.** What a board is
remains what CONTEXT.md says it is: a named description of one architectural
subject at one level, owning its views and its tree of variants. Nothing in that
requires one of those variants to be implemented.

## Why a per-node marker was rejected

Three reasons, any one of which is sufficient.

**The node has nowhere to put it, deliberately.** `SemanticNodeSchema` is
`.strict()` with nine fields (`src/shared/semantic-board/lib/content.ts`:123-135),
and `status`, `planned`, `exists` and `lifecycle` are all refused on input
today. A tenth field could of course be added; the reason not to is the next
two.

**The picture has nowhere to say it.** Every visual channel is already allocated
([ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md):43-67):
structural containment owns the body border and tint, the node type owns the
icon chip, relationship type owns curated colour, line pattern and arrowhead,
author emphasis owns line weight, and selection owns an outer ring. The one
channel left is the one comparison status already takes — it overrides the
semantic border on nodes and the line colour on edges (ADR 0025:62-64). So a
"planned" marker would want to draw itself in the channel that already draws
"added". On a draft those are the same claim made twice, and on the current
variant they would be a contradiction the board itself invited: a node saying it
does not exist inside the architecture the board says is implemented.

**It would be a second, authored answer to a question the store already derives,
and only the authored one can go stale.** None of the sixteen default node kinds
says whether a thing is, only what it is
(`src/shared/semantic-policy/index.ts`:98-115), and that is not an oversight —
kind answers "what is this part", lifecycle answers "is this architecture
built", and they are different questions asked at different scales. A per-node
marker splits existence between a claim an author maintains by hand on every
node and a fact the store computes for the whole variant, which is precisely the
split ADR 0023 closed when it ruled that agents never author change flags. The
per-node version would additionally have to be un-marked, node by node, the day
the thing ships.

**Absence of a `binding` cannot carry the meaning either.** This is not a fourth
reason but the reading somebody will reach for, and the product already refuses
it in terms: the inspector explains that a node with no binding may be
implemented and simply not bound yet, "so this says what is missing rather than
guessing why"
(`src/ui/semantic-board-canvas/components/SemanticInspectorParts.tsx`:105-108).
An unbound node means nothing has been bound to it. It has never meant that
nothing was built.

## What this supersedes

Two statements in the record put existence on a node, and one denies that a
board can lack a current architecture. All three are superseded here; the
edits themselves belong to the implementation of TASK-270.

- **ADR 0023:120-121** — "A node has at most one optional primary code binding.
  Nodes on the same board may bind to different repositories, and planned nodes
  can have no binding." The first two sentences stand unchanged. The clause
  about planned nodes is superseded: a node is planned because of the variant it
  is on, never because of what it lacks. `binding` stays optional for the reason
  the inspector already gives — a part may be implemented and simply not bound.

- **`src/shared/semantic-board/lib/content.ts`:108-109** — "A planned node has
  none" says the same thing in the schema's own voice, where an author is most
  likely to read it. It is corrected to say what optional actually means, and
  what it does not mean.

- **CONTEXT.md:250-252** — "**Current**: The designation of the variant that
  describes the architecture that exists." The sentence is right about what the
  designation means and wrong to imply every board has one. The entry records
  that the designation is optional and what its absence says: that nothing this
  board describes has been built.

- **[ADR 0030](0030-a-proposal-nobody-will-carry-out-is-shelved-not-deleted.md):62-63**,
  and the refusal implementing it
  (`src/runtime/semantic-board-store/lib/shelve.ts`:81-86) — "The current one,
  because a board with no current architecture is not a board and there is no
  proposal there to let go." **The refusal stands; its reason does not.** A board
  can have no current architecture, and a board for unbuilt work is exactly that.
  What a board cannot do is lose the current architecture it has: shelving the
  current variant would take a board that said what was built and leave it saying
  nothing, with only a shelving reason to explain why. The wording is rewritten
  around that, and the refusal code is unchanged.

## Consequences

- **Adoption is the moment a planned board's architecture starts existing**, and
  the record already has room for that moment: `Adoption.from` is documented as
  "The variant it took the designation from, absent for the first one"
  (`src/shared/semantic-board/lib/aggregate.ts`:122-124), a branch no board can
  reach today because creation designates the first variant without recording an
  adoption. A board created with no current variant is the first thing that
  reaches it. Nothing becomes historical, because nothing was current.

- **A drill-down that asks for whichever variant is current can now find
  nothing there** (`content.ts`:83). This is not a new case: ADR 0023:111-112
  already rules that a missing named target never silently falls back to the
  current designation, and the reverse resolves the same way — the viewer says
  there is nothing there rather than opening a proposal as though it were
  implemented.

- **A root draft still has no predecessor, so there is nothing to compare it
  against**, and that is correct rather than a gap. A board for unbuilt work is
  not a proposal relative to anything; it describes something that is not there.
  What tells a reader so is the board's own lack of a current variant, which is
  why TASK-270 requires that to be visible in the pane and in the drawing rather
  than only in a variant summary.

- **A binding on such a board is ahead of the code, not behind it.** The vault
  checker's `BINDING_PATH_MISSING` and its two repairs are framed entirely around
  a binding that went stale
  (`src/runtime/semantic-board-store/lib/bindings.ts`:112-117). Giving an
  ahead-of-the-code binding its own standing, or deciding it is always wrong, is
  now a question this decision makes askable; TASK-270 owns the answer.

- **Every reader of `current` must handle its absence or be shown unreachable
  for such a board.** The audit of those readers is recorded in TASK-270 as the
  plan of record for that work.
