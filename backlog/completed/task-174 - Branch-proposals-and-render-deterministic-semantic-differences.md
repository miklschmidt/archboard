---
id: TASK-174
title: Branch proposals and render deterministic semantic differences
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-12 04:54'
labels:
  - ready-for-agent
dependencies:
  - TASK-173
references:
  - TASK-170
documentation:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/design/semantic-boards-implementation.md
priority: high
type: feature
ordinal: 325000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Make architectural alternatives inspectable without agents manually assigning change labels or relying on drawing position.

## Blocked by

TASK-173

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Agents create named single-parent variants including competing siblings and chained proposals while inherited entities keep their IDs.
- [x] #2 Proposal comparison uses its actual predecessor and stable node/edge/step identity before view filtering; field changes affect only the changed entity.
- [x] #3 The renderer labels added/removed/changed subjects, deliberately scopes removals to the selected view with reference context retained, and derives removed baseline depiction rather than authoring tombstones.
- [x] #4 Inspection exposes meaningful before/after values; view/layout changes do not mislabel architectural nodes; identity and visible difference workflows are verified.
- [x] #5 Branch creation uses the shared board-global claim and expected-version write boundary, persists atomically and advances the board version exactly once.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Two halves, both independent of the renderer and the viewer, so they can be built while the
data-flow fork and the inspector are still in flight.

1. Branching, in the store. A new transition derives a variant from a named predecessor: the whole
   content is carried over with every identity intact, the new variant is a draft, and its parent is
   the variant it came from. Competing siblings and chains are the same operation applied twice, so
   there is nothing extra to build for either — what makes them work is that ancestry is recorded
   and identities are not reminted. `current` stays where it is; branching designates nothing.

2. Comparison, pure, in src/shared/semantic-board/lib/compare.ts. Match two contents by identity and
   derive added, removed, changed and unchanged for nodes, relationships, flows and their steps,
   keeping field-level before and after for anything that changed. Three rules decide what counts:
   - Comparison reads the whole variant, before any view filtering. A view that hides a node is not
     a variant that lost one.
   - Only the entity whose own semantic fields moved is labelled. Changing a relationship does not
     badge its endpoints, and adding a node does not badge the container it went into.
   - Presentation intent is not architecture. A relationship's emphasis changing is a change to how
     much attention it is asking for, not to what it is, so it does not badge the relationship; and
     views are not compared at all, because renaming a way of reading a board is not a redesign of
     the board.
   Removed subjects are returned with their baseline record, so a depiction can draw them without
   anything ever having been written into the proposal. A helper composes the two into one content
   for the renderer to draw, which is where the derived depiction lives and dies.

3. Then, once the renderer is free: draw the labels from that comparison, and answer a proposal's
   render with its predecessor comparison automatically rather than as a separate mode. Then the
   inspector's before-and-after, coordinated with TASK-172's owner.

Verification: store tests for branching, sibling competition, a chain, and identity preservation
through inheritance; contract tests for each comparison rule, including the three negative ones —
an edge change leaving its endpoints unchanged, an emphasis change labelling nothing, a view change
labelling nothing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: branch/compare/depict/inspect for competing proposals. compareVariants reads a proposal against its actual predecessor by identity, with emphasis and views excluded as presentation and order compared over the entries both variants hold, so an insertion or a removal shifts nothing after it. The render answer carries changes {predecessor, standing} derived on the way out; the picture is drawn from the proposal's content plus what the change took away, scoped to the reading — a view restores only what its own corner has context for, including the participant a removed step was addressed to. The renderer marks added/removed/changed in shape, lightness and texture before colour. The inspector resolves a subject from the proposal first and from the predecessor for what the proposal dropped, so every count is a count of one architecture, and shows per-field before/after for nodes, relationships, flows and steps. semantic branch goes through the same claim, expected-version and one-atomic-write boundary.

Verified: 53 renderer owners (10 mutation checks, plain renders byte-identical to before decoration), 64 viewer owners, 10 server owners for the drawing and its scoping, system owners through real HTTP for derived changes, a select-all view, and branching. Independent rechecks passed for branch boundary, restoration/scoping, renderer/wire and the inspector counts; the reviewer reports all TASK-174 findings closed.

UI recheck findings fixed after the fact, both about a board reached through a drill-down: a board with one variant now says which state it is (name and lifecycle, said rather than offered) instead of showing nothing, because what else could be read and what is being read are two questions; and choosing a view at a drilled level no longer drops the variant the link named — it kept the level's own reading but defaulted its variant to null, so the first grammar switch silently moved the pane to that board's current state. Owned by semantic-board-variants.test.tsx and semantic-board-levels.test.tsx, both mutation-checked.

AC#5 evidence added at close: branching.test.ts now proves a branch advances the board exactly once against the version it was written for, and that a branch written against a version the board has moved past is refused with BOARD_VERSION_CONFLICT with nothing written. Mutation-checked against accepting a stale expected version.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-09-11 22:02
---
Visual half of AC#3 is in the tree; the caller-side derivation (server) and the ticket status are the owner's. Samples rendered in both themes and both grammars and reviewed as PNGs.
---

author: @claude
created: 2026-09-11 22:29
---
Deviation to flag: SemanticInspector.tsx would have gone over the 600-line cap, so its presentation primitives moved to a new components/SemanticInspectorParts.tsx. New file, no conflict with anything in flight; no other file outside the assigned set was touched.
---
<!-- COMMENTS:END -->
