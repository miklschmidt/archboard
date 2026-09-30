---
id: TASK-173
title: Switch architecture and message-sequence views of one variant
status: Done
assignee:
  - '@claude'
created_date: '2026-09-11 18:14'
updated_date: '2026-09-11 22:32'
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
ordinal: 324000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-170

## What to build

Reuse the same architectural identities across complementary named views, inheriting both PR Lens grammars instead of inventing a reduced diagram language.

## Blocked by

TASK-171

The user pre-approved this breakdown and autonomous implementation on feat/semantic-boards. Follow the accepted design and preserve legacy board files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Named views select architecture or message-sequence content from shared variant-owned nodes, edges and flows; referential integrity and stable step identities are enforced.
- [x] #2 Agents author ordered message flows and semantic view intent without layout coordinates; both grammars render readable labels and hierarchy.
- [x] #3 A person can switch views or show different views in separate panes; camera/view changes do not write board content.
- [x] #4 Behavioral and rendered verification covers two views over the same subjects, message order, missing references and view state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Both PR Lens grammars, over one set of identities. Research: upstream layout/dataflow.ts is 307
lines and svg/dataflow.ts 496, both keyed on Flow/FlowMessage/FlowParticipant; they need the same
design tokens, geometry, text measurement and atlas the architecture grammar already uses in
src/runtime/semantic-renderer. TASK-172 is rewriting lib/regions.ts, lib/layout/{seating,
architecture}.ts and lib/svg/architecture.ts, so the only contested file is index.ts; the renderer
half of this ticket waits until that agent reports it has stopped writing there.

1. Contract (src/shared/semantic-board, mine). Add to VariantContentSchema:
   - `flows`: id, name, summary?, participants (node ids, 2..12), steps (1..64) of
     { id, from, to, label, kind sync|async|return|self, note?, repeat? }. Order is array
     position, never a stated number, so a document cannot disagree with itself.
   - `views`: id, name, grammar architecture|data-flow, summary?, scope = all | a selection of
     node, edge and flow ids.
   Integrity: flow, step and view ids share the one namespace nodes and edges are in; participants
   and step endpoints resolve to nodes on the same variant; a `self` step's endpoints agree; a
   selection names something that exists; a data-flow view scopes at least one flow. Input
   spellings mirror the node and edge ones: ids optional and minted, endpoints by id or name.

2. Store. Flows and views join the one batch: upsert by stated id or unique name, remove by id,
   judged on the final candidate exactly as nodes and edges are. Removing a node removes the flows
   whose participants it was, the steps that touch it and the view selections that named it, for
   the same reason removing a node removes its edges.

3. Renderer (after TASK-172 releases it). Fork the data-flow grammar from PR Lens at the pinned
   revision, dropping delta, animation and PR provenance as the architecture fork did, measuring
   through the same owners and filling the same atlas. One entrypoint decides grammar and scope:
   renderSemanticView(content, view, theme, fonts). Scope is resolved before layout, so a view that
   hides a node is not a board that lost one.

4. Server and CLI. The render route takes `view`; the reply says which view it drew and what the
   board's views are, so a pane can offer them without a second call. `semantic render --view`.

5. Viewer. A view switcher in the pane; the active view is per pane and lives in the address
   (`viewA=<id>` beside `paneA=`), so two panes can show two views of one board and a reload keeps
   them. Switching a view or moving the camera never writes the board: the only writes in this
   ticket are the agent's.

6. Verification. Contract tests for the new integrity rules; store tests for flows and views in one
   batch and for what removing a node takes with it; renderer tests for both grammars over the same
   identities, message order and a scoped view; a rendered viewer test for switching; a browser
   owner showing two views of one board in two panes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: canonical flows/views with stable step identity and one-namespace ids; PR Lens data-flow grammar forked (no size caps) with renderSemanticView dispatching on the view's grammar; view bar, per-pane view state and viewA in the workspace address; selectors refused when stated but empty, repeated or outside the vocabulary; CLI render carries {id,name,grammar}.

Verified: 53 renderer owners over both grammars and themes; 95 contract and 56 store owners; the semantic system lane including a sequence view drawn through HTTP and refusal cases; independent reviews passed for the model/store, the renderer, the view/address boundary and a real browser run at 1920x1080 covering switching between grammars, reload and Back/Forward restoring both the view and the URL.
<!-- SECTION:NOTES:END -->
