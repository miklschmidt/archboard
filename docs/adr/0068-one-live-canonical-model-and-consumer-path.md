# One live canonical model and consumer path

Status: Accepted through TASK-549.24 on 2026-10-29.

## Context

ADR 0066 establishes explicit canonical reads and migration authority.
ADR 0067 establishes compact active proposals.
The remaining live board writers and consumers still expose a second authoring model.
Agents can select obsolete levels and ownership paths that canonical modules replace.
The approved TASK-549.24 transition requires one live model and an explicit migration route.

## Decision

An unmigrated vault returns `LEGACY_AUTHORITY` without an automatic rewrite.
Inventory, explicit mapping, preview, retained originals, and explicit migration remain available.
Legacy decoding serves only those operations and exact retained history.

Retire live board authoring, board ownership routes, fixed-level authoring, and obsolete public exports.

Share the existing model and flow projection rules between client and backend consumers.
Structural exports and complete behavioral exports use the existing semantic renderer.
Reproducible SVG and PNG recipes use the existing artifact metadata owner.
Git discovers embedded artifacts, and explicit repair uses the same renderer and rasterizer.
No board-owned tracking list or name-based identity repair remains live.

Code inspection reads canonical content through the existing language and infrastructure algorithms.
Unavailable repositories and source revisions remain explicit skips.
The semantic reader no longer owns a separate source path scan.
Locality and branch footprint retain the existing Git analysis through canonical counterparts.
Their results identify the actual canonical model, state, and revision.
They introduce no source-history retention or new analysis engine.

The canonical reading travels in `pane_model`, and the client renders it locally.
`panes[].architecture` captures exact context for explanation and narration.
The browser's activation action remains the only owner of shown-conversation changes.
The existing agent feed follows durable canonical changes.
Agents continue to execute locally.
