---
id: TASK-120
title: Make unavoidable connector crossings explicit and verifiable
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 17:18'
updated_date: '2026-08-27 08:55'
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
Architecture diagrams sometimes need two connectors to cross. Add a deliberately narrow CLI bridge operation that represents one supported, explicitly named proper connector intersection using exactly two generated line decorations: an opaque mask and a style-matched redraw of the chosen over-connector.

Creation requires an explicit opaque #RRGGBB background. It supports distinct live arrow/line connectors whose TASK-119 decoder yields finite, unrotated, non-curved, non-rounded, non-elbowed straight-polyline segments. It deterministically selects one proper interior intersection, using --at only when needed or supplied. It preserves both source connectors and writes the two parts through the ordinary one-write mutation boundary.

Each part stores the same strict product-owned customData.archboard.bridge facts except role: bridgeId, role, overConnectorId, underConnectorId, overSegmentIndex, underSegmentIndex, crossing, and background. The mask element ID is the bridge ID. Removal resolves exactly one complete metadata pair and deletes only those two parts, even if sources moved or disappeared; malformed, duplicate, or conflicting provenance is refused.

TASK-119 inspection schema v2 validates bridge provenance, suppresses only an exact valid recorded crossing, and reports incomplete or stale decoration. Valid bridge parts are excluded only at the live inspection, architecture/compare, and describe entry seams. This task does not infer backgrounds, route connectors, edit sources, add a general decoration taxonomy, implement renderer parity, add UI/MCP behavior, or publish skill/reference documentation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A CommandContract-backed `archboard bridge` create command requires explicit `--over`, `--under`, and opaque six-digit `--background`, accepts optional `--at`, supports only deterministic proper intersections from TASK-119 connector geometry, and returns a strict JSON result with board, bridge ID, source IDs, selected segments/point, exactly two role-ordered generated elements, and the ordinary fingerprint.
- [ ] #2 Exactly two unbound, ungrouped generated line elements are created without changing either source connector. The mask element ID is the bridge ID; both parts carry strict product-owned `customData.archboard.bridge` containing only bridgeId, role, overConnectorId, underConnectorId, overSegmentIndex, underSegmentIndex, canonical crossing, and normalized background.
- [ ] #3 Create and `bridge remove <bridge-id>` each perform exactly one mutation and one board content write through the normal doing/claim/version/note-conflict boundary, mint IDs only through the shared owner, repair indexes normally, and never read or edit the vault note directly.
- [ ] #4 Creation deterministically enumerates proper intersections, requires a unique `--at` match within inclusive 0.5 px when multiple intersections exist, and refuses missing/identical/unsupported connectors, no match, ambiguity, endpoint contact, collinear overlap, malformed or zero-length paths, unusable styles, insufficient over-segment span, and invalid background with actionable existing-boundary diagnostics.
- [ ] #5 The mask is ordered above both sources and the redraw immediately above the mask. Geometry derives from the selected over segment; the mask uses the explicit opaque background and the redraw copies only the supported over-connector stroke style. Valid bridge decorations are excluded only from inspection semantic modeling, architecture/compare, and describe, with before/after compare and describe output unchanged.
- [ ] #6 TASK-119 report schema v2 adds one closed `BRIDGE_PROVENANCE_INVALID` finding with incomplete-decoration and stale-decoration reasons. Inspection suppresses only the exact proper source pair/segments/crossing when both parts, source-derived geometry/style, and z-order validate; invalid or unseen candidates suppress nothing, and an existing comparison ceiling remains the sole capacity stop.
- [ ] #7 Removal resolves exactly one strict mask/redraw metadata pair by bridge ID, verifies mask identity and identical stored facts except role, deletes only those two IDs, intentionally tolerates missing/moved sources and stale part geometry/style/order, and refuses incomplete, duplicate, or conflicting provenance without writing.
- [ ] #8 Pure and public tests cover representative supported/refused geometry, deterministic `--at` tolerance, explicit color normalization, metadata parsing, valid suppression plus a second unmarked crossing, incomplete/stale provenance, stale-or-orphan-safe removal, unchanged compare/describe bytes, package stdout/stderr/exits, one-write/doing/version behavior, 60 current CommandContract paths with the immutable 57 subset, and one sequential headless fixed-point round trip without new pixel or two-pane requirements.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a module-root `src/runtime/board-inspection/bridge.ts` exposing strict bridge schemas/types, the high-level pure create/removal planners/validator, and `isBridgeDecoration`. Reuse or extract TASK-119 supported-connector decoding and exact intersection owners privately; do not create a second geometry implementation.

2. Define strict bridge metadata with eight fields: bridgeId, role, overConnectorId, underConnectorId, overSegmentIndex, underSegmentIndex, crossing, background. Use the mask element ID as bridgeId. Candidate markers are records with an own bridge key; only fully valid line metadata qualifies as decoration.

3. Implement the pure create planner for distinct supported arrow/line connectors and deterministic proper interior intersections. Require explicit normalized #RRGGBB background. Select by ordered segment indexes and canonical point; use optional/required --at with inclusive 0.5 px unique matching. Derive two finite line inputs along the over segment, refuse unusable styles or insufficient span, and never mutate sources.

4. Implement provenance removal by bridgeId. Require exactly one strict mask whose ID equals bridgeId and one strict redraw with identical stored facts except role. Delete only those two IDs. Do not require live or unchanged sources and never delete by geometry.

5. Extend the inert inspection snapshot only for bridge metadata and needed persisted line style. Collect candidates before filtering valid decorations. Bump the inspection report to schema v2 and add one closed BRIDGE_PROVENANCE_INVALID code with incomplete-decoration and stale-decoration reasons and closed issue enums.

6. Integrate exact suppression into the existing connector-intersection pass using structural keys, the existing proper-intersection predicate, current source-derived geometry/style, and required z-order. Invalid candidates suppress nothing. If the comparison ceiling stops the pass, preserve its existing indeterminate result rather than declaring unseen bridges stale.

7. Filter valid decoration parts only at architectureFacts/compare entry, describe entry, and inspection semantic-model entry. Make compare counts/bounds/plain inventory derive from the filtered model. Do not add a general decoration registry or touch unrelated readers.

8. Add internal POST /api/bridges and DELETE /api/bridges/:id CLI adapters. Each performs planning inside the locked board mutation and one elementMutation: create upserts two inputs; remove deletes two IDs. No pre-GET or write-boundary exception.

9. Add `bridge` and `bridge remove` CommandContracts, strict results, existing board-write refusals plus one actionable BRIDGE_REFUSED boundary outcome, and exactly one REST relationship each. Grow the current registry from 58 to 60 paths, marking both introducedBy TASK-120 while preserving the immutable ordered 57 subset and all old argv/help bytes. Leave generated proof views, skills, and TASK-123.03 untouched.

10. Validate through existing owners: focused inspection/geometry/branch/one-write/contracts/CLI checks, representative planner/provenance/removal cases, unchanged compare/describe bytes, and one addition to the sequential fixed-point fixture. Then run two stable fix passes, complete `bun run check`, and a separate complete `bun run test`. Review the fixed range `2c5a639ddb432447308f9dba557156aab1391c89..HEAD` independently on Standards and Spec before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-27 implementation checkpoint: added the pure board-inspection bridge contract and strict eight-field provenance, reused TASK-119 decode/intersection owners, integrated schema-v2 provenance findings and exact crossing suppression, filtered valid decorations at inspection/architecture/compare/describe, and added one-write POST/DELETE adapters plus CommandContracts. Current focused evidence: type-check, lint, boundaries, module-scope, inspection (734), contracts (60 paths/1000 checks), CLI package (35 commands/25 subcommands/596), and one-write (80) green. TASK remains In Progress with AC unchecked; fixed-point/full validation remains.
<!-- SECTION:NOTES:END -->

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

author: @codex
created: 2026-08-27 08:08
---
Parent orchestration started after TASK-119 shipped at 75a7f52. Before implementation, the existing bridge plan must receive a current-source xhigh review against the released inspection and CommandContract seams. The review must apply a deletion test and reject speculative routing, broad semantic taxonomies, generalized background analysis, or defensive machinery beyond the narrow two-part bridge create/remove/verify contract.
---

author: @codex
created: 2026-08-27 08:29
---
Parent approved the xhigh deletion-test amendment. Mandatory explicit background, minimal eight-field metadata, mask-id bridge identity, stale/orphan-safe removal, one schema-v2 provenance code, two one-write adapters, 58-to-60 registry growth, and the protected-scope/test deletions are the implementation contract.
---
<!-- COMMENTS:END -->
