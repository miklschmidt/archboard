---
id: TASK-120
title: Make unavoidable connector crossings explicit and verifiable
status: To Do
assignee: []
created_date: '2026-08-25 17:18'
updated_date: '2026-08-26 01:26'
labels:
  - ready-for-agent
dependencies:
  - TASK-119
references:
  - src/core/metadata.ts
  - src/core/apply-element-input.ts
  - src/core/compare.ts
  - src/core/arrow-binding.ts
  - scripts/check-fixed-point.mjs
  - tasks/task-088
  - tasks/task-089
  - tasks/task-123.01
  - tasks/task-123.03
priority: medium
type: enhancement
ordinal: 122000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Architecture diagrams sometimes need two connectors to cross. Excalidraw renders coincident lines without a native bridge or crossover semantic, so the viewer cannot tell which line continues. During the device-trust refinement, each unavoidable crossing was treated by adding two decoration elements above the existing connector pair: an opaque mask centered on the intersection, followed by a short redraw of the chosen over-connector. The existing connectors, mask, and redraw produced three visible layers. That solved the pixels, but the parts were hand-positioned, could become stale when either connector moved, and carried foreign customData.archboardDecoration metadata with no connector provenance. Archboard cannot distinguish an intentional bridge from an accidental crossing, verify that a bridge still matches its connectors, recreate one safely, or remove one by identity.

Add a first-class, deliberately narrow bridge CLI operation for known connector intersections. Proposed shape: archboard bridge --board <key> --over <arrow-id> --under <arrow-id> [--at <x,y>] [--background <color>] --doing <description>, with a supported removal operation. Locate one supported intersection, derive the mask color from the smallest containing solid opaque fill or accept an explicit color for a visually uniform plain, transparent, or unfilled backdrop, add the two decoration elements at the required z-order, and store product-owned provenance under customData.archboard.bridge. Creation and removal use the ordinary mutation boundary and each count as one requested act and one board write.

Do not build a whole-board router. Support proper interior intersections between straight segments of unrotated polyline connectors. Refuse endpoint or tangent contact, collinear overlap, curves, rotation, stale source geometry, unresolved multiple intersections, patterned backdrops, and visually mixed or ambiguous backgrounds. A shared bridge-decoration predicate excludes generated parts from describe, compare, containment, and architecture modeling without introducing a broad new semantic element taxonomy. TASK-119 validates provenance, suppresses only the exact recorded intersection, and reports incomplete, moved, mismatched, orphaned, or stale bridges. Preserve both source connectors, human routing, and human groupings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A CommandContract-backed CLI operation creates a bridge only when the named board, over-connector, under-connector, supported intersection, and background treatment are deterministic, and returns a schema-validated result containing bridge identity, generated parts, source identities, board fingerprint, and next-safe-operation fields.
- [ ] #2 Exactly two generated decoration elements use versioned product-owned customData.archboard.bridge metadata recording bridge ID, part role, over and under connector IDs, source segment indexes, canonical intersection, source-geometry fingerprints, generated part IDs, background provenance, and geometry version without foreign flat custom-data keys.
- [ ] #3 Creation and removal each perform one board write through the normal write boundary, require --doing, obey claims and optimistic version checks, preserve both source connectors, and never edit the vault note directly.
- [ ] #4 Multiple intersections require --at x,y to select one unique supported intersection within a documented tolerance. No match, unresolved ambiguity, endpoint or tangent contact, collinear overlap, unsupported curve or rotation, missing connectors, stale source geometry, patterned backdrops, and backgrounds that remain visually mixed or ambiguous after supported explicit disambiguation are refused with actionable diagnostics.
- [ ] #5 The mask is placed above both source connectors and a style-matched over-segment redraw immediately above the mask. A shared bridge-decoration predicate keeps both parts out of nodes, edges, containers, plain comparison inventory, describe output, and semantic compare while the result remains distinguishable at normal board zoom.
- [ ] #6 TASK-119 inspection recognizes valid bridge metadata, suppresses only the exact recorded crossing, and reports incomplete, mismatched, moved, orphaned, wrong-order, wrong-background, unsupported-version, or otherwise stale bridge decoration.
- [ ] #7 Removal resolves a bridge by stored provenance, verifies the complete generated part set and unchanged source identities, deletes only those generated parts, refuses partial or conflicting metadata, and leaves the former crossing visible to inspection.
- [ ] #8 Pure and public-interface tests cover proper polyline intersections, --at tolerance, endpoint and tangent contact, collinear overlap, curves, rotation, inferred solid fills, caller-supplied colors over uniform plain or transparent backgrounds, patterned and mixed-background refusal, contract input and result validation, one-write behavior, claims, optimistic conflicts, save and reopen, connector movement, safe removal, unchanged semantic compare, real-browser fixed point, and two-pane delivery without direct element-object mutation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Specify a versioned bridge contract under customData.archboard.bridge, reusable Zod schemas for its command result and metadata, and one shared isBridgeDecoration(element) predicate. Record bridge ID, mask and over-segment roles, over and under connector IDs, source segment indexes, canonical intersection, source-geometry fingerprints, generated part IDs, background provenance, and geometry version. Keep foreign flat custom data untouched. Apply the predicate explicitly in every semantic reader rather than adding a broad element-classification model.
2. Add a pure bridge planner over TASK-119 geometry primitives. Support proper interior intersections between straight segments of unrotated polyline connectors. Enumerate supported intersections deterministically; when more than one exists, require --at x,y and select the unique match within a documented tolerance. Resolve the mask background from an explicit color for a visually uniform plain, transparent, or unfilled backdrop when supplied, otherwise from the smallest containing solid opaque fill. Refuse no match, unresolved ambiguity, endpoint or tangent contact, collinear overlap, curves, rotation, stale source geometry, patterned backdrops, and visually mixed or ambiguous backgrounds.
3. Generate exactly two new elements without modifying either source connector: an opaque mask above both source connectors and a short over-segment redraw immediately above the mask. Copy stroke color, width, style, and cap behavior from the named over-connector. Mint compliant IDs, preserve monotonic indexes through ordinary index repair, attach complete metadata to both parts, and put the whole plan through the ordinary element-input and synchronous mutation boundary as one act, one version check, one --doing, and one write.
4. Implement bridge removal as a provenance-driven mutation. Resolve the bridge by stored bridge ID and generated part IDs, verify the complete part set, roles, connector identities, fingerprints, and absence of conflicting metadata, then delete only the two generated parts. Refuse partial or conflicting provenance rather than deleting by geometry or visual proximity.
5. Apply the shared bridge-decoration predicate consistently in describe, compare, containment, and the TASK-119 architecture and obstacle models. Bridge parts remain non-semantic decoration and never become nodes, edges, containers, plain comparison inventory, or unidentified Archboard elements. Extend TASK-119 inspection to validate provenance and suppress only the exact recorded connector intersection while reporting orphaned sources, moved crossings, missing or mismatched parts, wrong z-order or background, and unsupported metadata versions.
6. Declare bridge creation and removal through CommandContract with explicit board identity, Zod input and result schemas, typed refusals, color and intersection disambiguation, board fingerprint, generated identities, help metadata, and TASK-123.03 reference examples. Keep the operation narrow: no route search, source-connector movement, automatic whole-board insertion, or handwritten bridge parts.
7. Test the pure planner and metadata validator first, then public mutation behavior. Cover supported polylines, multiple intersections, tolerance boundaries, endpoint and tangent contact, collinear overlap, curves, rotation, inferred light and dark fills, approved explicit-color fallback, patterned and mixed-background refusal, contract validation, one-write proof, claims and optimistic conflicts, save and reopen, movement-induced staleness, safe removal, and unchanged semantic compare. Finish with real-browser fixed-point and two-pane delivery checks plus type-check, geometry, inspection, one-write, CLI contract coverage, and the complete sequential suite.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:21
---
Planning pass completed from current source inspection. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-25 23:48
---
Plan review incorporated the originating two-part bridge behavior, narrow decoration predicate, supported geometry, provenance-safe removal, and approved uniform explicit-color fallback. No implementation started.
---

author: @codex
created: 2026-08-26 00:03
---
TASK-124 removes the MCP surface. Bridge creation and removal are now CLI-only CommandContracts.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: bridge creation and removal remain CLI-only CommandContracts. No equivalent secondary agent command is planned.
---
<!-- COMMENTS:END -->
