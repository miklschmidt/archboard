---
status: accepted
---

# Semantic boards own meaning, and renderers own presentation

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) replaces the
independent live boards, their variant families and their board writes with one
canonical model. [ADR 0066](0066-canonical-model-reads-keep-legacy-authority-explicit.md)
replaces board ownership, and
[ADR 0067](0067-active-proposals-store-identity-changes.md) replaces complete
draft snapshots. Authored meaning, local rendering, and renderer-owned geometry
remain.

Human drawing edits mostly repaired agent layout and organization mistakes.
Agents repeatedly produce diagrams with weak visual and typographic hierarchy.
The board model expresses architectural meaning and presentation intent. The
renderer owns geometry and styling, so one improvement can benefit every board.

## Decision

- Agents can express containment, ordered flows, focal subjects, diagram
  grammar, and the order in which nodes and relationships enter layout. Agents
  do not author coordinates, font sizes, colors, or connector routes.
- Compare variants deterministically using stable architectural identities.
  Agents do not author change flags. Badge the entity whose semantic properties
  changed. Changing an edge does not automatically badge its endpoint nodes as
  changed. Changes to renderer geometry, styling, or bookkeeping do not count as
  changes to architecture. Narrative or view changes alone do not badge
  architectural nodes as changed.
- A variant is drawn, inspected, narrated and compared against the board's
  current variant, not its predecessor. The current variant is the reference
  and shows no comparison. A board with no current variant has no now. On such
  a board, each draft is read against the one it came from. Removed content
  comes from that baseline and is not reinserted into the proposal's authored
  content. Ancestry still follows the parent.
- Every state has a lasting name. `current` is a movable designation, not the
  state's identity. Adoption is explicit once a variant describes implemented
  architecture. Leadership approval alone keeps it a proposal. Rendering or
  merging code does not automatically move `current`.
- Define the canonical contract in Zod. Derive TypeScript types from it. When
  needed, JSON Schema can be generated from the combined Zod schema. It is not
  a second hand-maintained contract.
- Agents author a walkthrough's ordered steps, their subjects and their views.
  The viewer owns every interaction with them. Presenting or narrating a
  walkthrough writes nothing about it. The pane's report of the presented step
  is read-only telemetry, in the same class as the view and the selection.
- The browser is a viewer that writes nothing, and it does not author content.
  It can hold a board's content only as a read-only cache of what the server
  said, which the server invalidates by announcing a new version. The canvas
  draws its pictures in the page with the same renderer core that the CLI runs.

## Relationship to existing decisions

This replaced the Excalidraw foundation archboard started on, the
element-metadata model in ADR 0003, the Obsidian-specific requirements in ADR
0004, and ADR 0015's choice of Excalidraw elements as the canonical
representation. Semantic identity and code bindings belong to the nodes,
independently of their graphical representation.

The renderer started as an adapted fork of PR Lens. The user compared the
candidates visually and chose PR Lens for its clarity and finish, and because it
already owned geometry.
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md)
and later ADRs replace its layout. ADR 0028, ADR 0039 and ADR 0052 replace the
clauses that ruled out a fit criterion and a density policy.
