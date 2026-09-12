---
id: TASK-172
title: 'Inspect semantic containment, code bindings and linked levels'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:13'
updated_date: '2026-09-11 21:37'
labels:
  - ready-for-agent
dependencies:
  - TASK-171
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 323000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Let people understand responsibilities and move from a system overview to service internals or code without manually arranging drawing objects.

## Blocked by

TASK-171

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nodes show meaningful visual hierarchy and optional responsibility/description; single-parent acyclic containment is validated and rendered.
- [x] #2 Selection exposes semantic details and an optional primary code binding, including per-node repositories and planned unbound nodes.
- [x] #3 Explicit drill-down targets open a named variant or intentional current on another board, visibly identify the selected target variant, and report missing targets without guessing.
- [x] #4 The browser workflow exercises nested containment, code navigation and linked system/service boards; frontend content remains read-only.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Researched plan

Read first: ADR 0023, docs/design/semantic-boards-implementation.md, the whole of
src/runtime/semantic-renderer (regions -> seating -> architecture layout -> plan/tracks/
curves routing -> svg), src/shared/semantic-board, src/ui/semantic-board-canvas,
src/ui/selection-inspector, and both comments on this ticket.

### What the current renderer actually does, and why that decides the shape of the work

A diagram is a row of fixed-width columns (bands), one per root container, plus one
trailing implicit band for everything uncontained. Cards sit on a row grid that is
SHARED across all bands, so rank N is the same y in every column - that is what makes a
cross-column arrow run straight. The router is built on that skeleton: a route travels
through "corridor i" (the vertical gutter left of band i) and "band i" (the horizontal
strip above row i), and plan.ts/tracks.ts address channels purely by (regionIndex, row).

That skeleton is load-bearing and I am not replacing it. Everything below fits inside it.

### 1. Containment rendered as containment (AC #1)

regions.ts becomes a containment FOREST rather than a one-level sort:

  * A column is one root container, or one implicit group of uncontained roots.
  * Inside a column the content is a sequence of BLOCKS. A leaf child is a one-row
    block; a child that is itself a container is a block spanning a header strip plus
    its own children`s blocks, recursively. Depth is not capped; a container with no
    children is a card, as today.
  * Containment is never re-derived here: single-parent and acyclic are already
    guaranteed by checkSemanticBoard, and the forest walk relies on that.

seating.ts allocates rows per column BLOCK-WISE rather than card-wise, so a subtree
occupies a contiguous run of rows and nothing foreign interleaves: a block starts at
max(next free row in this column, rowOfRank(min rank in the block)) and recurses. Rank
still pushes content down and still pairs two same-rank cards side by side; what it
loses is exact rank alignment for cards inside a nested group, which is the right
trade - containment is the stronger statement.

architecture.ts draws a container as a real BOX that hugs its own rows:
  * top = the header strip immediately above its first row, bottom = under its last
    row. A container whose content starts at rank 3 therefore starts at rank 3 instead
    of showing three blank rows inside a full-height frame (comment #2 defect 1).
  * nested containers inset by a per-level padding and carry their own smaller header.
  * the row gap above a row that starts K nested container headers is expanded to fit
    them, through the GapExpansions mechanism that already exists for congestion; the
    grid gains a per-row "reserve" so tracks.ts keeps its horizontal channels clear of
    the header text.
  * chrome gains "container": a container is routable as its whole box, so an edge
    naming one terminates on the box edge rather than on the header`s subtitle
    (comment #2 defect 2). plan.ts stops treating a container as a row-sharing card.

### 2. Uncontained roots spread (AC #1, comment #1)

The single implicit band becomes 1..N implicit columns. regions.ts ranks the loose
nodes, and distributes each rank across the implicit columns so same-rank nodes sit
side by side instead of stacking; N is bounded so a flat graph becomes a readable grid
rather than one very wide strip. A chain a->b->c still reads as a chain.

### 3. Selection exposes semantic detail (AC #2)

The semantic pane gets its OWN inspector, in src/ui/semantic-board-canvas/components.
Why not the shell`s src/ui/selection-inspector: that inspector projects an Excalidraw
element - element type, customData.archboard metadata keys, path focus - none of which
a semantic node has, and it is fed from src/ui/application, which this ticket does not
own. Extending it would mean either teaching it a second unrelated subject shape or
editing the application shell; a pane-local inspector keeps the semantic viewer whole
and is deleted with nothing when Excalidraw goes.

It reads the board document through the existing fetchSemanticBoardDocument route,
parses it with parseSemanticBoard from @/shared/semantic-board, and resolves the
variant the drawing names. It shows kind, responsibility, the description (deliberately
not on the card), containment ancestry, and the primary code binding - repository and
path per node, so two nodes binding different repositories read as different
repositories - and says "planned, not bound to code" for a node with no binding rather
than showing an empty field.

### 4. Drill-down (AC #3)

Needs a schema field owned by the implementation lead; the exact shape has been sent
and this part waits for it. When it lands: a node naming another board and a variant of
it offers to open it; opening discloses the TARGET variant`s lifecycle (current /
proposed / historical) and its name; a named target that is not there says so and opens
nothing, and { kind: "current" } is honoured only because it was written. Navigation is
pane-local presentation state with a trail back, unless the lead asks for the address to
follow it.

### 5. Verification

Module tests under src/runtime/semantic-renderer/tests for the containment rule and the
spread rule, behavioural only (geometry and atlas, never file contents). Rendered
samples at three levels and a flat graph written to SVG with embedded faces and looked
at in a browser, in both themes, iterating on the picture. A browser owner under
tests/system/browser exercising nested containment, inspection with a code binding, and
two linked boards, registered in support/browser-selection.ts and the
test:serial-browser script. Then tsc (both configs), both lint configs, oxfmt --check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renderer containment rework landed. `lib/regions.ts` now derives a containment forest of blocks instead of a one-level sort; a column is one root container or one of up to three implicit columns the uncontained nodes are dealt across by rank. `lib/layout/seating.ts` seats a column block by block so a subtree takes a contiguous run of rows. New `lib/layout/containers.ts` places a container box at any depth: it hugs the rows it holds, its title block sits in the row gap immediately above its first row, and the grid reserves exactly as much of that gap as the deepest stack of titles in any column needs. `LayoutGrid` gained per-row reserveAbove/reserveBelow so routing channels stay clear of container chrome; `Chrome` is now "card" | "container" and an edge naming a container terminates on the box rather than on a header strip. Painting puts container titles on their own layer above the lines so a route into the first card of a container cannot strike the words out. Measured: 8 uncontained nodes were 428x546 (a two-card column) and are now 1248x250 across three columns; the three-level sample renders all three levels, and the "persists to" arrowhead lands on the Storage frame. 18 renderer tests pass, both lint configs and oxfmt clean.

Inspection and drill-down landed in the viewer. `src/ui/semantic-board-canvas/lib/board-document.ts` reads the board through `parseSemanticBoard` and answers what a picture does not carry; `lib/queries.ts` gained `semanticBoardDocumentQuery` on the same freshness contract as the drawing, and `useSemanticBoardChanges` now invalidates both reads of a board rather than only its pictures. `components/SemanticInspector.tsx` is the semantic pane`s own inspector (the shell`s projects an Excalidraw element and is fed from `src/ui/application`, which this ticket does not own); it shows kind, responsibility, containment both ways, the description that is deliberately not drawn, and the primary binding — repository and path per node, and "Planned. This node is not bound to code." where there is none. `components/SemanticDrillDown.tsx` resolves the target board at open time: it discloses the target variant and its lifecycle before opening, and reports a missing board or a missing named variant rather than falling back to whatever is current. `hooks/use-drill-down.ts` holds the pane-local stack; the view bar is hidden while drilled in, because a view id belongs to the board it was chosen on. 9 rendered owners under `tests/semantic-board-inspection.test.tsx`; 29 module tests pass.

Three rendering defects found by review were fixed in the renderer and each given a mutation-checked owner: a container is now attachable only on the zone above its first row (a route no longer runs behind the cards inside it), a title band is a channel the router will not cross (an entry into a nested node comes in from a flank below it), and nesting widens the column instead of shrinking the card — a twelve-deep chain`s innermost card is exactly as wide as a card on a flat board, where it was previously -8.

Verification. Renderer: 21 architecture owners (38 across the module with the data-flow grammar) pass; three of them are the mutation-checked regressions for the review defects. Viewer: 33 owners in src/ui/semantic-board-canvas, 13 of them new under tests/semantic-board-inspection.test.tsx, three of those the mutation-checked regressions for the inspector defects. Browser: tests/system/browser/semantic-board-inspection.test.ts passes against a real canvas, and semantic-board-viewer.test.ts still passes beside it. Type-check is clean for both configs on every file this ticket touched, both lint configs and oxfmt --check are clean, and the semantic-board system lane is 13 pass.

Looked at rather than inferred: four architectures rendered to SVG with embedded faces and opened in a browser in both themes (three-level, mixed containment, a flat graph, a chain), plus the running shell photographed with a node selected and its drill-down disclosed. Two things were changed because of what the pictures showed and not because a test failed — a container title is painted above the lines so nothing can strike it out, and the inspector`s close control was rendering as a filled blue square because a variant class was being passed where variant props were wanted.

Three defects of my own, found by looking: (1) picking a card was re-fitting the diagram, because a panel that takes its width out of the pane changes the pane`s size and the pane re-fits itself whenever its size changes; the panel is now over the diagram rather than beside it. (2) The board document and the drawing are two reads of one versioned board, and only the drawing was being invalidated on a change. (3) `stage-harness.tsx` needed `changes: null` on its render fixtures after that field landed on the reply schema.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-11 19:05
---
Carried from TASK-171: the architecture renderer derives its bands from containment, so a variant that states no containment at all lands every node in one implicit band — a fixed-width column two cards wide (8 uncontained nodes render 428x546). That is fine for an architecture that uses containment, which is what ADR 0023 asks agents to author, but it reads badly for a flat graph, which is the first thing an agent usually writes. Rework the band model here, where nested containment is already being rendered, so that uncontained roots spread instead of stacking. src/runtime/semantic-renderer/lib/regions.ts owns the rule.
---

author: @claude
created: 2026-09-11 19:29
---
Carried from TASK-171 visual inspection (both themes opened in a real browser with the embedded faces): two layout defects to take with the containment rework. (1) The shared row grid leaves large empty bands: a region whose first card is at rank 3 shows three empty rows while a neighbouring region starts at rank 0, so over half of a band can be blank. Rank is meaningful and the uniform band height is deliberate, but the result is airy enough to read as a mistake. (2) An edge that names a container terminates on the band's header anchor, so the arrowhead lands on the header's subtitle text - visible on "persists to" arriving at the Storage band. When a container becomes a real nested box rather than a header anchor, both should resolve; if they do not, they are worth fixing on their own.
---

author: @claude
created: 2026-09-11 21:37
---
Scope note on acceptance criterion #4, "code navigation", so the next ticket is not surprised by it. What a person can do now is reach the code: picking a node out shows its primary binding — repository and path, with branch, commit and confirmation time when the binding carries them — and two nodes on one board showing two different repositories is exercised by both the rendered owners and the browser owner. What they cannot do is open it: there is no "Open code" control on a semantic node. The shell has one, but it goes through `src/ui/application` and a route that resolves an Excalidraw element id against a board note, and neither the route nor the shell wiring knows what a semantic node is. Wiring it needs a server route keyed by board-plus-semantic-id and a shell action beside it, which is outside what this ticket owns. TASK-179 is where the pane and its addressing are reworked and would be the natural place; it needs the user`s say-so rather than mine.

The other deliberate limitation, for the same reason: following a drill-down changes what the pane shows without changing the address, and the way back is a trail in the pane. The view bar is hidden while somebody is down a level, because a view id belongs to the board it was chosen on and offering the choice there would ask the server for an id from a different board. Both go away when the address learns to carry a level.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Containment is drawn as containment at every level, and what a card cannot carry is reached by inspecting it.

The renderer stopped flattening containment to one band per root. `lib/regions.ts` derives a containment forest; `lib/layout/seating.ts` seats a column block by block so a subtree takes a contiguous run of rows; new `lib/layout/containers.ts` places a container box at any depth, hugging the rows it holds, with its title in the row gap above its first row and the grid reserving exactly as much of that gap as the deepest stack of titles needs. A container is now a box an edge lands on rather than a header strip, nesting widens the column instead of squeezing the card, uncontained nodes spread across up to three implicit columns instead of stacking, and a title band is a channel routes go round.

The viewer gained the pane`s own inspector. It reads the board document rather than the picture, so a narrowed view never narrows what a drawn subject can be asked about, and it shows containment both ways, the description that is deliberately not drawn, and the one primary code binding — per-node repositories, and "Planned. This node is not bound to code." where there is none. A drill-down resolves its target at open time: it discloses the target variant and its lifecycle before opening, follows a moving `current`, and reports a missing board or a missing named variant rather than falling back to whatever is current. Following one is pane-local presentation state with a trail back, drawn in every state of the pane including the ones with no diagram. Nothing in the browser writes a board.

Verified with 38 renderer owners, 33 viewer owners and a browser owner running against a real canvas, six of them mutation-checked regressions for defects an independent review found; with both type-check configs, both lint configs and oxfmt clean; and by rendering four architectures to SVG in both themes and photographing the running shell, which is what caught the two defects no test had an opinion about.
<!-- SECTION:FINAL_SUMMARY:END -->
