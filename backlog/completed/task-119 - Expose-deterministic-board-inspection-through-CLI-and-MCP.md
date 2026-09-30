---
id: TASK-119
title: Expose deterministic board inspection through the CLI
status: Done
assignee:
  - '@codex'
created_date: '2026-08-25 17:17'
updated_date: '2026-08-27 06:23'
labels:
  - ready-for-agent
dependencies:
  - TASK-123.01
references:
  - src/core/geometry.ts
  - src/core/labels.ts
  - src/core/compare.ts
  - src/core/metadata.ts
  - src/core/apply-element-input.ts
  - src/core/board-io.ts
  - scripts/check-geometry.mjs
  - scripts/check-labels.mjs
  - tasks/task-090
  - tasks/task-123.01
  - tasks/task-123.03
priority: high
type: feature
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard can currently prove that a board is structurally renderable and can compare selected semantic layout, but it cannot answer the completion question agents actually need: does this board still contain route-through-node errors, accidental connector crossings, overlaps, stale linear geometry, broken references, label drift, or policy violations? The relevant knowledge is split across geometry, labels, comparison, metadata, and browser-only screenshots. This gap led the device-trust refinement work to rely on one-off parsers and full-board image inspection. A clean semantic compare could coexist with arrows passing through boxes, a local reroute could create a new crossing elsewhere, and a fit-to-board export could make small defects effectively invisible.

Add a pure, shared inspection module as the single product interface for board quality. Expose it through a vault-direct archboard check --board <key> command that works without the canvas server or a browser. Return a schema-validated stable result with a code, severity, coverage state, involved element and node identities, scene coordinates, and a bounding box suitable for focused rendering. Keep inspection read-only: it must not claim, repair, rewrite, save, open, or otherwise mutate the board.

Reuse product geometry and semantic modeling rather than copying formulas into scripts. Semantic node identity remains exclusively keyed by customData.archboard.node; union elements carrying the same node ID and their bound labels when calculating node geometry. When inspection needs to treat an unpromoted grouped or library-stencil instance as one visual obstacle, model that separately and retain its constituent element IDs. groupIds never create or merge architectural nodes and never change semantic compare. Container boundaries are not routing obstacles, and a connector excludes its own endpoint nodes and containing zones from unrelated-node tests.

Normal board reads and every write retain strict render-geometry validation. Inspection gets a narrowly scoped decode path for parseable persisted notes so invalid element geometry can be reported as a finding instead of being rejected before inspection runs; note parse failures remain operational errors. Curves, rotation, ambiguous geometry, or other unsupported cases produce explicit unsupported or indeterminate findings rather than a false clean result. Coordinate any new Excalidraw geometry approximation with TASK-090 and use differential evidence where handwritten behavior could drift from upstream.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pure inspectBoard(elements, policy?)-style module returns a deterministic report without browser, filesystem, canvas, or mutation dependencies.
- [x] #2 archboard check --board <key> is declared through CommandContract, reads the named persisted board directly, works without a running canvas server or browser, emits its schema-validated result plus an optional concise text mode, and performs no board write, claim, open, save, repair, or rewrite.
- [x] #3 The command contract declares inspection inputs, stable result schema, prerequisites, read-only effect, text mode, strict refusal and exit semantics, examples, and all metadata required by generated help and the TASK-123.03 result reference.
- [x] #4 A narrowly scoped inspection decode reports invalid render geometry, stale linear dimensions, broken bindings or references, bound-label corruption, configured font-policy violations, and unsupported geometry without weakening validation on normal reads or any write.
- [x] #5 Layout findings cover unrelated leaf-node penetration, unmarked connector intersections, node overlap, and label overlap with stable element IDs, node IDs, coordinates, and bounding boxes.
- [x] #6 Containment-aware modeling aggregates semantic nodes only from elements sharing customData.archboard.node, models grouped unpromoted stencil geometry separately as visual obstacles when needed, preserves groups containing several promoted nodes, excludes endpoint nodes and containing zones, and does not report a connector merely for crossing a container boundary.
- [x] #7 Reports state whether coverage is complete or indeterminate. Strict mode has documented deterministic exit semantics by severity and never reports clean when a case was skipped, unsupported, or indeterminate.
- [x] #8 Public-interface regression fixtures include a dense, human-grouped architecture board where semantic compare is clean and a locally improved route creates a second crossing elsewhere; a whole-board recheck catches the regression.
- [x] #9 Tests cover negative relative points, stale dimensions, endpoint and zone exclusions, promoted multi-element nodes, grouped unpromoted stencil obstacles, groups containing multiple promoted nodes, tolerance boundaries, unsupported curves or rotation, stable report ordering, contract validation, and clean stdout and stderr separation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep implementation blocked. After parent approval and a clean independent rereview, record this plan in TASK-119 through the Backlog CLI. Freeze 963c3f0c5dadd3687a30d5133437e822427da582 as the implementation and review base, confirm the checkout is clean, and give one serialized implementation worker exclusive edit ownership. Before extraction, add exact compare characterizations for node facts, edge facts, warnings, order, groups, containment, bound labels, and canonical JSON.

2. Add one deep module at src/runtime/board-inspection. Its public index.ts exports versioned Zod schemas, inferred types, defaults, and inspectBoard(records: readonly unknown[], policy?). The raw readonly input is deliberate: inspection must report malformed persisted records without first asserting ServerElement. A narrow architecture.ts entrypoint exports only shared architecture facts needed by compare. Private lib files own decoding, model construction, broad-phase enumeration, exact supported predicates, detectors, sorting, and text formatting. The pure module may import pure runtime geometry, label, and metadata readers. It must not import fs, vault resolution, board stores, server or browser state, claims, clocks, network clients, or mutation functions.

3. Define the public identities and report before implementing detectors:
   - ScenePoint is finite x/y, rounded to 0.001 px, with negative zero removed.
   - SceneBBox is finite x/y/width/height with nonnegative dimensions and the same normalization.
   - Every finding exposes affectedBBox and focusBBox. affectedBBox is the exact supported affected region. focusBBox expands it by exactly 16 px on every side in schema version 1. Both are null only for an unlocatable malformed record. Padding is therefore visible interface data, not a hidden constant.
   - ElementRef is id or null, type or null, and sourceIndex. Source index disambiguates malformed and duplicate ids. A missing, empty, or non-string raw id always becomes id null rather than a minted or placeholder id.
   - NodeRef is the nonempty customData.archboard.node string plus sorted elementIds and labelElementIds.
   - ObstacleRef contains id, kind library-component or grouped-component, sorted elementIds, sorted groupIds as evidence, and normalized library attribution per attributed member. Its id is the literal "obstacle:" prefix plus the sorted constituent element ids joined with ",". groupIds never contribute to identity.
   - InspectionFinding is a discriminated union with code, reason, fixed severity, affectsCoverage, code-specific details, stable message, sorted refs, sorted points, affectedBBox, and focusBBox.
   - InspectionReport has schemaVersion 1, success true, normalized policy, limits, total/live/locatable counts, deterministic broadPhaseComparisons, coverage complete or indeterminate, clean, maxSeverity none/warning/error, counts by severity and code, sorted coverageReasons, and sorted findings.
   - clean means coverage is complete and findings is empty. coverage is indeterminate exactly when at least one finding has affectsCoverage true.
   - The CLI result wraps the pure report with the requested board key. It omits the absolute note path. Operational diagnostics may name the path on stderr, but machine-local paths do not enter deterministic output.

4. Implement this exhaustive finding union. Zod must encode every code/reason combination as a closed discriminated union, and a compile-time exhaustive switch must format every variant:

| Code | Closed reasons and required detail fields | Severity | affectsCoverage | Points and boxes |
| --- | --- | --- | --- | --- |
| INVALID_RENDER_GEOMETRY | invalid-render-fields: invalidFields and valueKinds for x/y/width/height; unlocatable-record: recordKind, invalidFields, and sourceIndex | error | always true | A locatable record uses its finite x/y as a point and a zero-area affected box when size is unavailable. unlocatable-record has empty points and null boxes. |
| STALE_LINEAR_DIMENSIONS | width, height, width-and-height; storedWidth, storedHeight, measuredWidth, measuredHeight, widthDelta, heightDelta | error | false | Normalized absolute path points and the measured path box. |
| BROKEN_REFERENCE | invalid-element-identity: identityIssue missing-id/empty-string-id/non-string-id, rawIdType, rawIdDescription, sourceIndex, intendedRoles, availableElementType; duplicate-element-id: duplicateId/sourceIndexes; missing-binding-target: connectorId/end/targetId; invalid-binding-target-type: connectorId/end/targetId/targetType; missing-binding-reciprocal: connectorId/end/targetId; malformed-start-binding and malformed-end-binding: connectorId or null/sourceIndex/rawKind/issue/readableTargetId/classificationBlocked; malformed-bound-elements: ownerId or null/sourceIndex/rawKind/entryIndex/issue/readableEntries/classificationBlocked; malformed-container-id: textId or null/sourceIndex/rawKind/rawDescription/issue/ownerClassificationBlocked; dangling-bound-text: ownerId/targetId; dangling-bound-arrow: ownerId/targetId; conflicting-bound-label-owner: textId/forwardContainerId/reverseContainerIds; persisted-agent-endpoint: connectorId/end/inputTargetId/bindingTargetId; invalid-node-metadata: elementId/valueKind; invalid-code-binding: elementId/issues; derived-link-persisted: elementId/link; invalid-library-attribution: elementId/issues/rescuedByGroup | error | invalid-element-identity is true exactly when intendedRoles is nonempty. duplicate-element-id, missing-binding-target, invalid-binding-target-type, conflicting-bound-label-owner, and invalid-node-metadata are true. malformed start/end binding equals classificationBlocked; malformed-bound-elements equals classificationBlocked; malformed-container-id equals ownerClassificationBlocked. persisted-agent-endpoint is true only when the input target is missing from or disagrees with the canonical binding. invalid-library-attribution is true only when no qualifying group component makes obstacle membership decidable. All other reasons are false. | Union of locatable involved elements. invalid-element-identity uses ElementRef id null plus sourceIndex. A missing target uses the connector or owner. A finding has null boxes only when its source record is also unlocatable and gets INVALID_RENDER_GEOMETRY/unlocatable-record. |
| LABEL_CORRUPTION | orphan: textId/containerId; duplicate: containerId/keeperId/duplicateIds; missing-reciprocal: textId/containerId/missingSide; conflicting-owner: textId/containerId/otherContainerIds; drift: textId/containerId/distance/allowed; persisted-seed: elementId/seedField | error | true for orphan and conflicting-owner; false for duplicate, missing-reciprocal, drift, and persisted-seed | Union of label and known container. Drift also emits anchor and text-centre points. Always non-null. |
| FONT_POLICY_VIOLATION | missing-font-family: effectiveFamily 1/allowedFamilies; disallowed-font-family: rawFamily/effectiveFamily/allowedFamilies; invalid-font-family: rawType/rawDescription/allowedFamilies | warning | false | Text element box and centre point. |
| UNSUPPORTED_GEOMETRY | unsupported-type: rawType; rotation: angle; curve: curveKind; rounded-or-elbowed: roundness/elbowed/fixedSegments evidence | warning | always true for the element or detector role that was skipped | Locatable element extent and any valid points. Non-null unless the same record is unlocatable and has the render-geometry finding. |
| AMBIGUOUS_GEOMETRY | points-missing: connectorId or null/sourceIndex/rawPointsKind missing/rawPointsDescription/pointCount null/minimumRequired 2/issue missing; points-not-array: connectorId or null/sourceIndex/rawPointsKind/rawPointsDescription/pointCount null/minimumRequired 2/issue non-array; points-empty: connectorId or null/sourceIndex/rawPointsKind array/pointCount 0/minimumRequired 2/issue empty; points-one-point: connectorId or null/sourceIndex/rawPointsKind array/pointCount 1/minimumRequired 2/issue insufficient-cardinality; malformed-point: connectorId or null/sourceIndex/pointIndex/issue; zero-length: connectorId or null/sourceIndex/segmentIndex; collinear-overlap: firstConnectorId/firstSegmentIndex/secondConnectorId/secondSegmentIndex | warning | always true | Missing, non-array, and empty use finite stored connector geometry and empty points. A valid one-point path uses its absolute point and zero-area affected box. A malformed one-point tuple also emits malformed-point and falls back to stored geometry. zero-length applies only to two consecutive valid identical points. collinear-overlap uses the shared interval. Null boxes require the same record to be unlocatable and carry the render-geometry finding. |
| INSPECTION_LIMIT_EXCEEDED | broad-phase-comparison-ceiling: limit/attempted/pass/segmentCount/nodeCount/obstacleCount/labelCount | warning | always true | Empty points; affectedBBox is the union of locatable pair-analysis inputs and focusBBox is its padded form. |
| CONNECTOR_PENETRATES_NODE | leaf-footprint-interior: connectorId/segmentIndex/nodeId/entry/exit | error | false | Entry and exit points; affectedBBox encloses the interior crossing. |
| CONNECTOR_PENETRATES_OBSTACLE | obstacle-footprint-interior: connectorId/segmentIndex/obstacleId/entry/exit | error | false | Entry and exit points; affectedBBox encloses the interior crossing. |
| CONNECTOR_INTERSECTION_UNMARKED | proper-interior-crossing: connector ids, segment indexes, point | error | false | One crossing point and a zero-area affectedBBox. |
| NODE_OVERLAP | leaf-footprint-overlap: firstNodeId/secondNodeId/overlapWidth/overlapHeight | error | false | affectedBBox is the positive-area intersection. |
| LABEL_OVERLAP | label-node-overlap: labelId/nodeId/overlapWidth/overlapHeight; label-label-overlap: firstLabelId/secondLabelId/overlapWidth/overlapHeight | error | false | affectedBBox is the positive-area intersection. |

   invalid-element-identity rawIdType is a closed enum of missing, undefined, null, string, number, boolean, bigint, symbol, function, array, and object. rawIdDescription is a stable bounded description that never serializes a function body or object contents. Its intendedRoles enum is connector, semantic-node-member, valid-library-body, qualifying-group-body, bound-label, label-container, closed-boundary, font-policy-text, node-overlap-body, and label-overlap-body. The inspector derives roles from type, metadata, provenance, grouping, binding fields, and valid geometry without an id.

   Binding null or absence remains canonical "not bound." A present non-null startBinding/endBinding is well formed only when it is a non-array object with a nonempty string elementId, finite focus and gap, and absent, null, or finite two-number fixedPoint. The malformed binding issue enum is not-object, array, missing-element-id, empty-element-id, non-string-element-id, missing-focus, nonfinite-focus, missing-gap, nonfinite-gap, or invalid-fixed-point. classificationBlocked is true for the first five target-unreadable cases and false when elementId remains readable. A well-formed readable target then uses the separate missing target, wrong type, or missing reciprocal reasons.

   boundElements may be absent, null, or an array of objects with nonempty string id and type text or arrow. malformed-bound-elements issues are not-array, entry-not-object, missing-id, empty-id, non-string-id, missing-type, and invalid-type. Any malformed entry prevents complete reciprocal and label-owner classification and sets classificationBlocked true. containerId may be absent, null, or a nonempty string. A present empty or non-string containerId on an applicable text participant emits malformed-container-id with ownerClassificationBlocked true.

   Every skipped applicable element or pair must produce INVALID_RENDER_GEOMETRY, BROKEN_REFERENCE, UNSUPPORTED_GEOMETRY, AMBIGUOUS_GEOMETRY, or INSPECTION_LIMIT_EXCEEDED. Known decoration excluded by the closed obstacle policy is not an applicable collision object and is not a skip. There is no generic details bag, unknown finding code, or ingest-time id minting.

5. Fix deterministic ordering. Severity sorts error before warning. Within severity, use the declared code order from step 4, then reason order, node ids, obstacle ids, element ids or source indexes, first point, affectedBBox coordinates, and message as a final tie-breaker. Sort all nested refs, ids, roles, points, coverage reasons, and count keys independently. Normalize numeric interface data only after exact predicate evaluation.

6. Normalize this versioned policy inside inspectBoard:
   - allowedFontFamilies defaults to [5] and accepts a sorted unique list drawn from 1, 2, 3, 5, 6, 7, 8, or the literal any.
   - dimensionTolerance defaults to 0.5 px and keeps production remeasureLinear behavior: a delta equal to 0.5 is stale.
   - intersectionTolerance defaults to 0.5 px for endpoint/contact classification.
   - overlapTolerance defaults to 0.5 px. Node and label overlap or penetration must exceed it.
   - There is no labelPlacementTolerance. LABEL_CORRUPTION/drift comes only from boundTextDrift and its container-dependent allowed distance.
   - The CLI exposes repeatable --font-family plus any, --dimension-tolerance, --intersection-tolerance, and --overlap-tolerance. All tolerances must be finite and nonnegative.
   - The normalized report includes the resolved values.

7. Read persisted fonts exactly. For a text record, an explicit numeric integer in 1, 2, 3, 5, 6, 7, or 8 is its effective family. An absent fontFamily means legacy family 1. Missing therefore violates the default [5] policy. Strings, NaN, infinities, fractional values, and other numbers are invalid-font-family and never default silently. Add fixtures for absent, explicit 1, explicit 5, numeric 2/3/6/7/8, string "5", zero, four, fractional, NaN, and infinity. New-element conversion may continue defaulting to 5; inspection describes persisted records and does not change conversion.

8. Extract shared architecture facts without compare drift. The shared model contains live raw records that passed the fact being read, confirmed bound-label ownership, semantic nodes, element-to-node membership, primary element selection, aggregateNodeFootprint, nodeBodyFootprint excluding confirmed labels, supported owned boundary elements, connectors, and resolved endpoint nodes. Preserve compare's current insertion order, area ranking, label preference, metadata precedence, promoted-connector handling, arrays, warnings, and output. Keep clusters, regions, prominence, plain inventory, diffing, prose, and result assembly in compare.ts. The compare adapter retains its present actual-element container candidates, inclusive box containment, 1.2 area guard, first-equal insertion behavior, and output strings. Pin exact canonical compare JSON before and after extraction.

9. Keep semantic identity closed. A semantic node exists only for a nonempty string at customData.archboard.node. All live members with that id form one node. A confirmed bound text joins its container's node without gaining its own node identity. groupIds never create, merge, split, or rename nodes. A group containing several promoted nodes keeps those nodes separate. Plain inventory remains exactly what compare currently records and never becomes an obstacle by default. A record that claims a modeled role but lacks a valid id stays out of the model only after invalid-element-identity records that omission and makes coverage indeterminate.

10. Use this closed obstacle predicate:
    - Start with live object records that have a unique nonempty id, valid finite positive extent, zero or absent angle, and exact type rectangle, ellipse, or diamond.
    - Exclude every connector, semantic-node member, confirmed bound label, and every unpromoted closed boundary that qualifies as a container-only boundary because it contains at least one semantic node body under step 11.
    - text, image, and freedraw are decoration-only. arrow and line are connectors. frame is boundary-only. None can be an obstacle body in schema version 1.
    - Valid library attribution is a plain object at customData.library with a nonempty string itemId or a nonempty string item. source is optional evidence and is never sufficient alone. Invalid attribution produces BROKEN_REFERENCE/invalid-library-attribution.
    - A shared-group edge exists only when two otherwise eligible body candidates share the same nonempty groupId. Union those edges into components.
    - A component qualifies when at least one member has valid library attribution, or when it contains at least two eligible body members joined by shared-group evidence. A valid library-attributed member with no qualifying group edge is a one-member library-component. A group-only singleton never qualifies.
    - Component bounds are the union of eligible body members only. Excluded text, image, freedraw, connectors, labels, node members, and container boundaries never inflate them.
    - Identity is the sorted constituent element ids. groupIds and library fields remain evidence.
    - Every remaining ungrouped plain shape, heading, callout, background panel, image, line drawing, and decoration stays plain inventory. It is not an obstacle without valid library attribution or the qualifying multi-body group evidence above. A future policy change requires separate approval.

11. Model zones from actual owned boundaries:
    - Supported closed boundary types are rectangle, ellipse, diamond, and frame records with finite positive stored bounds and zero or absent angle. This is the named inspection-v1-boundary-box containment rule, not renderer collision geometry.
    - A semantic node is a zone only through one of its owned supported closed boundary elements. aggregateNodeFootprint, bound labels, and the union of scattered node members can never create a zone boundary.
    - A boundary contains a child node when it contains the child's nodeBodyFootprint on all four inclusive edges and has strictly greater area. Labels do not enlarge either side of this containment test.
    - For each child, choose the smallest containing boundary by area, then stable boundary element id, then owner node id. Strictly increasing parent area makes the hierarchy acyclic. Equal-area candidates use the stable id tie-break; equal-area nodes cannot contain one another.
    - A leaf node has no child in this hierarchy.
    - For a connector endpoint, exclude the resolved start/end nodes and every transitive semantic parent zone. Also exclude confirmed labels belonging to those nodes.
    - An unpromoted supported boundary that contains a semantic node is container-only. It is excluded from obstacle construction, but it never becomes a semantic zone and crossing it does not produce a penetration finding.
    - Add equal-area competing containers, three-level nested zones, a bound label far outside its shape, a multi-element node whose union spans empty space, and scattered union members around a child. These must prove that only an actual owned boundary creates a zone.

12. Keep geometry ownership narrow. Refactor geometry.ts only enough to expose the pure invalid-render-geometry collection already used by validateRenderGeometry. validateRenderGeometry must still throw from that same collection. Reuse measureLinear, extentOf, remeasureLinear, boundTextsByContainer, planLabelRepair, boundTextDrift, and metadata readers. The inspection module privately implements strict absolute-polyline decoding, segment classification, axis-aligned architecture-box intersection, overlap depth, normalization, and tolerance application. It accepts negative relative points. It supports unrotated, non-rounded arrow and line polylines. It never uses pointsOf to discard malformed tuples silently. It distinguishes an unusable points container or insufficient cardinality from malformed tuples and true zero-length segments. Nonzero rotation, curve metadata, non-null linear roundness, elbow/fixed-segment metadata, unknown types in an applicable role, and collinear overlaps get the explicit findings from step 4.

13. Keep renderer evidence within TASK-119. Extend the existing fixed-point browser lane only to prove that retained supported stored bounds and negative relative arrow/line paths survive the browser round trip. Do not add ellipse or diamond collision replicas, arrow routing behavior, text measurement behavior, or other TASK-090 work. If supported bounds or paths disagree with the browser, stop implementation and coordinate with TASK-090 instead of tuning a second renderer.

14. Run one deterministic whole-board pipeline:
    - Decode/classify raw records and retain every sourceIndex before looking up ids.
    - Report invalid geometry, invalid identities, duplicate ids, unusable points containers/cardinalities, malformed point tuples, and zero-length segments before model construction. A modeled-role record may be omitted only after a coverage-affecting finding names the source index and blocked roles.
    - Validate binding object shapes and bound-reference containers before reading targets. Then validate well-formed target existence/type, reciprocals, node metadata, logical code bindings, persisted input-only endpoints/label seeds, derived local links, and library attribution.
    - Report stale linear dimensions from production remeasurement.
    - Use production label aggregation, repair evidence, and boundTextDrift for orphan, duplicate, reciprocal, owner-conflict, and drift findings. Never call recentreBoundTexts as a corruption threshold and never repair.
    - Apply persisted font policy to every live text.
    - Build semantic nodes, actual-boundary hierarchy, and closed obstacle components.
    - Test supported connector segments against unrelated leaf-node architecture footprints and qualified obstacle bounds after endpoint, label-owner, container, and transitive-zone exclusions.
    - Report only proper interior connector crossings outside endpoint tolerance. Endpoint contact is complete and non-finding. Collinear overlap is ambiguous and indeterminate. Until TASK-120 exists, every proper crossing is unmarked.
    - Report positive-area leaf-node overlaps after containment exclusions, label-to-unrelated-node overlaps, and label-to-label overlaps. A bound label is excluded from its own owner and transitive containing zones. Duplicate labels use LABEL_CORRUPTION rather than duplicate overlap findings.
    - Continue independent passes after local findings where safe. A skipped applicable item or pair always changes coverage.

15. Make pair work deterministic and bounded:
    - Convert supported connector segments, leaf footprints, obstacle boxes, and label boxes into stable minX/maxX intervals keyed by detector kind and stable identity.
    - For each pair pass, sort events by minX then maxX then identity. Maintain a min-heap by maxX plus a stable active set. Expire intervals whose maxX is outside the configured tolerance.
    - Apply pass compatibility and semantic exclusions before counting. Type-incompatible pairs, segments belonging to the same connector, self pairs, known endpoint nodes, a label's own node, transitive endpoint zones, and container-only boundaries never consume broadPhaseComparisons.
    - For each remaining distinct eligible pair whose x intervals overlap, increment broadPhaseComparisons before the y-range test. Run the exact predicate only after y overlap.
    - Runtime is O(N log N + A), where N is indexed intervals and A is eligible x-overlap comparisons. A is O(N squared) in the adversarial case. Memory is O(N) plus emitted findings.
    - Schema version 1 has an exported, non-configurable ceiling of 2,000,000 cumulative broad-phase comparisons across penetration and overlap passes. The report exposes that limit and the actual count.
    - On attempted comparison 2,000,001, stop remaining pair passes, emit one INSPECTION_LIMIT_EXCEEDED finding naming the pass and counts, preserve all completed structural findings, and mark coverage indeterminate. Never silently skip pairs.
    - The below-limit adversarial case has 400 semantic nodes, 1,200 single-segment connectors, and 400 bound labels. Each connector binds two nodes. No containment or obstacles alter eligibility. X ranges overlap while y ranges are mostly disjoint. It records exactly 1,516,200 eligible comparisons and completes without the limit or millions of findings.
    - The limit case has 500 nodes, 1,500 connectors, and 500 labels under the same rules. It deterministically attempts comparison 2,000,001 and returns the limit finding. Record elapsed time as diagnostic evidence, but gate on the comparison count and result because machine speed is not the interface.

16. Add an inspection-only raw note reader in board-io.ts. It resolves the global board key through parseBoardKey, requireVaultRoot, and vaultPathFor, reads with the existing synchronous note reader, decodes/decompresses the Drawing payload, requires an array root or an object with an elements array, and returns that raw ordered array. It stops before ingestScene. It performs no conversion, geometry validation, id minting, timestamps, versions, map deduplication, presentation overlays, baseline recording, board registration, claim, open, save, or write. Missing vault/note, non-Excalidraw note, decompression failure, JSON syntax failure, and missing elements array remain operational errors. Normal readBoardContent/readNote/ingestScene and every write stay strict.

17. Add src/cli/commands/check.ts as contract 58 and register it once in src/cli/commands/run.ts. Declare the global board prerequisite, no server/browser prerequisite, effects [local-read], no REST relationships, JSON/text output cases, every policy flag, examples, the stable result schema, and strict outcomes. The handler gets currentRequestedBoard, performs the direct vault read, calls inspectBoard, validates the wrapped result, and formats text only from the validated union. It must not call ensureCanvasRunning, canvas-client requests, claim/release, board open/save, applyElementInput, writeBoardContent, or atomic write.

18. Use these stream and exit semantics:
    - Non-strict computed reports exit 0 whether clean, warning, error, or indeterminate.
    - --strict exits 0 only for complete and clean; 6 for complete warnings-only; 7 for complete with any error; 8 whenever coverage is indeterminate, even if errors also exist.
    - Outcomes 6, 7, and 8 are declared stdout-only CommandOutcomes. They still emit validated JSON or deterministic text. Findings never use stderr.
    - Usage and policy errors exit 2 with empty stdout. Missing vault/note, parse/decompression/schema failure, and unexpected I/O exit 1 with empty stdout and diagnostics on stderr.
    - Check help documents all four strict outcomes and coverage precedence. General help keeps its existing exit text unchanged and adds one exact line: "               check only: 6 warnings, 7 errors, 8 indeterminate coverage."
    - Text output starts with board, coverage, clean, severity counts, broad-phase count/limit, and policy. It then prints findings in report order with code/reason, identities, points, affectedBBox, and focusBBox. It contains no machine-local absolute path.

19. Add dense before/after fixtures under scripts/fixtures/board-inspection. They contain human groupIds, promoted multi-element nodes, bound labels, one valid grouped/library-attributed obstacle, plain grouped decorations that must not become an obstacle, a group spanning several promoted nodes, nested actual-boundary zones, endpoint nodes, negative relative points, and enough connectors that local checking is unsafe. Pin exact compare JSON for both variants and require it to be byte-identical. The first route has one proper crossing. A local reroute removes it but creates another crossing outside the first finding's focusBBox. A whole-board check must report the new point.

20. Add scripts/check-board-inspection.mjs and test:inspection to the complete package test chain. Use production note rendering/readers, geometry, labels, metadata, compare, shared model, inspector, and package binary. Do not copy measurement, label, note, binding, or collision formulas into the script. Cover:
    - clean, warning, error, and indeterminate reports;
    - every code/reason union variant and exhaustive formatter branch;
    - missing, empty-string, and non-string ids for connectors, semantic-node members, valid library bodies, qualifying grouped bodies, bound labels, label containers, closed boundaries, font-policy text, node-overlap bodies, and label-overlap bodies;
    - points missing, undefined, null, object, string, empty array, one valid point, one malformed point, malformed tuples in longer paths, and genuine duplicate consecutive points;
    - malformed blocking startBinding and endBinding; readable-target malformed focus/gap; malformed boundElements container and entries; malformed empty/non-string containerId; and the separate well-formed missing/wrong/nonreciprocal cases;
    - every new structural case through direct inspectBoard input and a parseable note through the real package CLI. Each applicable case must be non-clean, indeterminate, schema-valid, text-formatted, and source-indexed, with no silent model or pair omission;
    - nullable boxes only for unlocatable records and exact 16 px affectedBBox/focusBBox deltas;
    - negative points; exact/inside/outside dimension, intersection, and overlap tolerances;
    - absent/1/5/other-valid/invalid fonts;
    - top/left aligned valid labels, real boundTextDrift, duplicate/orphan/reciprocal/conflicting labels, and no generic 0.5 placement finding;
    - library-attributed singleton and multi-member obstacles, qualifying multi-body group obstacles, invalid provenance, group-only singleton, ungrouped plain shapes, headings, callouts, background panels, images, freedraw, all-line stencils, and decoration groups;
    - actual-boundary zones, equal-area tie-breaks, nested transitive exclusions, bound-label-outside-shape, multi-element-union false zones, container-only boundaries, promoted multi-element nodes, and groups with several promoted nodes;
    - proper crossings, endpoint contact, rounded/elbowed/curved geometry, collinear overlap, rotation, unknown applicable types, node overlap, label overlap, stable identities, and ordering;
    - both deterministic performance sizes, exact counter semantics, mostly disjoint y ranges, and limit precedence.

21. Prove the package boundary and no side effects. Build notes in a temporary vault with production note rendering, run the package bin through Bun with no canvas process and a counting HTTP sentinel, and assert zero HTTP contacts. Snapshot vault paths, bytes, mtimes, locks, and state additions before and after JSON, text, strict, and operational-error cases. Assert zero writes, claims, opens, saves, repairs, rewrites, or id minting. Parse JSON stdout against the exported schema, pin text bytes, verify 6/7/8 with clean stderr, and verify operational/usage failures have empty stdout. Use malformed notes with invalid ids, paths, bindings, references, and render geometry to prove inspection reports source-indexed findings while normal read and write paths remain strict and preserve bytes. Keep test:one-write as a protected gate even though check proves zero writes.

22. Extend current generated metadata without rewriting the migration record. Add check with introducedBy TASK-119, update the current audit to 34 commands and 58 paths, and derive current counts from the audit. Keep all fixed-base 57-path compatibility and argv records byte-for-byte unchanged and require them as an ordered subset. Every post-base path must declare its introducing task. Normalize the fixed-base general-help comparison only by removing the one new check command line and the exact approved "check only" exit-help line. Add separate current assertions for check help, the exit line, JSON/text schemas, effects, outcomes, and all 58 paths. Regenerate cli-command-audit.md and the command-contract proof JSON/Markdown. Update command-contract-design.md only to distinguish the 57-path migration base from the 58-path current registry and document check-specific outcomes. Do not edit the released TASK-123.03 skill or result-reference source.

23. Use rollback-safe conventional commits:
    1. refactor(inspection): extract shared architecture facts
    2. feat(inspection): add deterministic board findings
    3. feat(cli): add vault-direct board check contract
    4. test(inspection): cover whole-board and bounded regressions
    5. docs(cli): generate and document the check contract
   Generated artifacts stay with the source that generates them. Stage only named files.

24. Run focused Bun-only gates after relevant checkpoints: bun run type-check, test:inspection, test:geometry, test:labels, test:branch, test:changes, test:contracts, test:cli, test:boards, test:obsidian, test:one-write, test:boundaries, test:module-scope, generator --check, and git diff --check. Run the fixed-point extension only in the existing sequential headless browser lane.

25. At completion, run bun run fix twice and prove the second pass changes no bytes. Then run bun run check and, separately, bun run test. Both complete chains must retain the four sequential headless browser checks. A browser failure triggers the documented isolated diagnosis and never authorizes weakening or skipping a gate.

26. Review the complete fixed range 963c3f0c5dadd3687a30d5133437e822427da582..HEAD with independent Standards and Spec reviewers after implementation. Use gpt-5.6-sol at medium for both broad reviews. Route valid findings to the same worker and reuse the same reviewers for complete fixed-range rereviews until both report clean. Do not finalize TASK-119 until the acceptance matrix, generated files, two stable fix passes, both full chains, and both reviews are clean.

APPROVED_DECISIONS

1. Approve the one-module seam and raw readonly unknown-record input. This preserves malformed-record reporting without weakening ServerElement or normal ingest contracts.
2. Approve the amended closed finding union and exact coverage rules in step 4, including invalid-element-identity, the four path-container/cardinality variants, and the four malformed binding/reference-structure variants.
3. Approve persisted font semantics: missing means legacy family 1; only explicit numeric 1, 2, 3, 5, 6, 7, or 8 is valid; default allowed policy remains [5].
4. Approve removal of labelPlacementTolerance and all generic 0.5 px placement findings. boundTextDrift is the only drift detector.
5. Approve the closed obstacle predicate in step 10. There are no catch-all singleton obstacles. Only valid library attribution or qualifying shared-group evidence creates an obstacle, and eligible body types are rectangle, ellipse, and diamond.
6. Approve actual-boundary zone modeling in step 11, with nodeBodyFootprint, strict greater-area containment, area/id tie-breaking, and transitive semantic parents. Compare keeps its separate 1.2 adapter.
7. Approve dual affectedBBox/focusBBox fields and exact 16 px schema-v1 expansion.
8. Approve the deterministic x-sweep, the 2,000,000 cumulative broad-phase comparison ceiling, the clarified eligible-pair counting rule, and the unchanged 400/1,200/400 plus 500/1,500/500 fixtures.
9. Approve strict exits 6/7/8, stdout-only reports, indeterminate precedence, check-specific help, and the one added general-help exit line.
10. Approve contract 58 while retaining all original 57 compatibility and argv records as an immutable subset. General-help normalization may remove only the check line and approved check-only exit line.
11. Approve axis-aligned architecture footprints and the limited fixed-point evidence. Curves, rotation, malformed paths, rounded/elbowed linear elements, collinear overlap, and unknown applicable types are indeterminate. No ellipse/diamond renderer collision or TASK-090 arrow/text behavior is added.
12. Approve omitting the absolute note path from the result. The pure report remains machine-independent; the CLI wrapper adds only the board key.
13. Approve one serialized gpt-5.6-sol/medium implementation worker with exclusive edit ownership.
14. The same independent gpt-5.6-sol/xhigh reviewer confirmed this final taxonomy amendment and returned PLAN_APPROVED before this plan was recorded or implementation began.

EXPECTED_MODIFIED_FILES

- TASK-119 through the Backlog CLI only after approval.
- src/runtime/board-inspection/index.ts
- src/runtime/board-inspection/architecture.ts
- src/runtime/board-inspection/schemas.ts
- src/runtime/board-inspection/lib/decode.ts
- src/runtime/board-inspection/lib/model.ts
- src/runtime/board-inspection/lib/geometry.ts
- src/runtime/board-inspection/lib/broad-phase.ts
- src/runtime/board-inspection/lib/detectors.ts
- src/runtime/board-inspection/lib/format-text.ts
- src/runtime/engine/geometry.ts
- src/runtime/engine/compare.ts
- src/runtime/engine/board-io.ts
- src/cli/commands/check.ts
- src/cli/commands/run.ts
- scripts/check-board-inspection.mjs
- scripts/fixtures/board-inspection/dense-before.excalidraw.json
- scripts/fixtures/board-inspection/dense-after.excalidraw.json
- scripts/fixtures/board-inspection/dense-compare.json
- scripts/check-command-contract.mjs
- scripts/check-cli-surface.mjs
- scripts/check-fixed-point.mjs
- package.json
- docs/agents/test-suite.md
- docs/design/cli-command-audit.json
- docs/design/cli-command-audit.md, generated
- docs/design/command-contract-proof.json, generated
- docs/design/command-contract-proof.md, generated
- docs/design/command-contract-design.md
- Private file splits may collapse if the same public seams and boundary rules remain clear. No other source area should be needed.

PROTECTED_SCOPE

- Preserve all existing 57 command spellings, schemas, owners, effects, refusals, output bytes, exits, order, and fixed-base records.
- Preserve normal strict render validation on every read and write, the one converter, synchronous board I/O, atomic writes, note hashing/versioning, locks, claims, doing, one-act/one-write, id minting, metadata namespacing, and presentation-link stripping.
- Inspection never mints, substitutes, or repairs an invalid raw id.
- Preserve compare output, its 1.2 container threshold, plain inventory semantics, insertion order, warnings, and canonical JSON.
- Preserve valid human top/left bound-label alignment. Do not use recentreBoundTexts or its 0.5 no-op write threshold as inspection policy.
- Ungrouped plain shapes and decorations remain non-obstacles without valid library attribution. groupIds never create semantic nodes.
- No server route, REST relationship, browser UI, runtime session state, write path, repair, or mutation behavior.
- No TASK-120 bridge creation, removal, provenance, suppression, or validation. Every supported proper crossing remains unmarked.
- No TASK-090 renderer work beyond retained bounds and negative-point fixed-point evidence.
- No TASK-126, TASK-127, TASK-121, TASK-122, or released TASK-123.03 skill/reference changes.
- No dependency change, npm/npx, test/lint/type weakening, skipped browser gate, or follow-up task.

VALIDATION_MATRIX

| Requirement | Production evidence | Primary gates |
| --- | --- | --- |
| Pure raw-record inspector | Frozen readonly unknown inputs, mutation traps, repeated byte equality, no impure imports | test:inspection, type-check, boundaries |
| Exhaustive public union | Every code/reason parses, formatter switch is exhaustive, unknown combinations fail | test:inspection, test:contracts |
| Invalid identity closure | Missing, empty, and non-string ids across every modeled role produce id-null source-indexed indeterminate findings | test:inspection |
| Path closure | Missing/non-array/empty/one-point paths stay distinct from malformed tuples and zero-length segments | test:inspection, test:geometry |
| Binding structure closure | Malformed start/end bindings, boundElements, and containerId are distinct from readable missing/wrong/nonreciprocal targets | test:inspection, test:labels |
| Direct and persisted malformed inputs | Each new variant passes through inspectBoard and parseable-note/package CLI with no minting or omission | test:inspection, test:cli |
| Invalid geometry without weaker ingest | Same malformed note reports through inspection and throws through normal read/write | test:inspection, test:geometry, test:boards |
| Persisted font semantics | Absent=1, explicit 1, explicit 5, other valid numerics, strings and invalid numbers | test:inspection, test:browser |
| Label policy | Top/left alignment stays valid; boundTextDrift reports only lost labels; no 0.5 placement policy | test:inspection, test:labels |
| Shared semantic model | Exact compare JSON before/after extraction and existing branch/change facts | test:inspection, test:branch, test:changes |
| Closed obstacle predicate | Positive library/group components and negative plain/group-singleton/decoration/image/line cases | test:inspection, test:library |
| Actual-boundary zones | Equal area, nested parents, transitive exclusions, outside label, union false-zone, container-only boundary | test:inspection, test:branch |
| No false clean | Every unsupported, malformed, ambiguous, skipped, and limited case changes coverage | test:inspection |
| Deterministic performance | Eligible-pair counting excludes incompatible/self/endpoint/owner/zone pairs; 1,516,200 below-limit comparisons; limit at 2,000,001 | test:inspection |
| Stable focus interface | affectedBBox exact, focusBBox exactly 16 px larger per side, null only unlocatable | test:inspection |
| Dense whole-board regression | Exact compare JSON remains identical while the crossing moves outside the old focusBBox | test:inspection, test:branch |
| Direct contract-backed CLI | Real package bin, contract 58, JSON/text/strict help and exits, zero REST | test:inspection, test:contracts, test:cli |
| No side effects | Zero HTTP, identical vault bytes/mtimes/tree, no id minting/locks/claims/open/save/repair/write | test:inspection, test:one-write, test:obsidian |
| Renderer differential | Only supported bounds and negative straight paths round-trip unchanged | sequential headless test:browser |
| Compatibility metadata | Old 57 records unchanged; only check/help-exit normalization; current 58 metadata fresh | generator --check, test:contracts, test:cli |
| Whole repository | Lint, format, both TS projects, all suites, four sequential browser checks | two stable fixes, bun run check, separate bun run test |
| Independent acceptance | Standards and Spec fixed-range reviewers both clean | reviewer callbacks over BASE..HEAD |

RISKS_AND_ROLLBACK

- Compare drift remains the highest refactor risk. Characterize first and isolate extraction in the first commit so it can be reverted alone.
- Raw records cannot borrow ingest's id minting. SourceIndex and id-null ElementRef make malformed identities stable without changing the note.
- A malformed binding may retain a readable target while another field is invalid. classificationBlocked records the exact difference, so structural errors do not overstate incomplete endpoint coverage.
- Human grouping is not proof that a shape blocks routing. The closed multi-body predicate rejects group singletons and decoration types; library attribution is the only product provenance that permits a singleton.
- Library provenance has no insertion-instance id. groupIds safely aggregate remapped instances. Ungrouped attributed bodies remain separate obstacles rather than merging every copy of one catalogue item.
- The boundary-box containment rule is an architecture rule, not exact ellipse/diamond collision. Naming and versioning it avoids claiming renderer equivalence. Aggregate node unions and labels cannot create zones.
- Invalid or absent fonts can change what a browser draws, but overlap uses persisted bounds. Font findings are policy warnings; malformed geometry remains the separate coverage mechanism.
- Broad-phase work is quadratic in the dense case. The deterministic 2,000,000 ceiling bounds work and turns every skipped remainder into an explicit indeterminate result. Counting after semantic exclusions keeps the limit tied to actual detector work.
- A single limit finding can coexist with completed errors. Exit 8 takes precedence so automation cannot mistake incomplete coverage for a complete error list.
- Adding check and one exit-help line changes general help. The compatibility test strips exactly those two approved additions and nothing else.
- The inspection reader could become a permissive general reader. Keep it raw, narrowly named, and unexported outside board I/O and check. Prove normal ingest/write strictness from the same malformed bytes.
- Every checkpoint is independently revertible. No note schema or persisted bytes change, so rollback requires no data migration.

USER-DIRECTED GENERATED-OWNERSHIP AMENDMENT (2026-08-26)

This amendment supersedes step 23’s requirement to commit generated artifacts with their source, step 24’s tracked generator --check assumption, step 26’s generated-files completion wording, and the generated-file entries in EXPECTED_MODIFIED_FILES. Keep docs/design/cli-command-audit.json tracked as the canonical human-authored audit input. Stop tracking docs/design/cli-command-audit.md, docs/design/command-contract-proof.json, and docs/design/command-contract-proof.md. Generate those three reproducible views on demand into an explicitly ignored location. Contract validation must evaluate the live registry/audit projection in memory or through owned temporary output, retain all 58-path/schema/audit/57-path compatibility/rendering proofs, and add clean-clone-style deterministic generation evidence that leaves the checkout untouched. Documentation must distinguish canonical input from derived views and repair consumers that assumed generated files were always present.

FINAL INTERACTION AND COORDINATE-TOTALITY REMEDIATION (2026-08-26)

After rejected rereview head 1c293b7c48a28c590652ae516a07c4579a3504f6, close five verified interaction holes through the existing pure inspectBoard and package CLI seams. Separate relative path validation from finite absolute origin eligibility; stop every identity-dependent producer after invalid identity while retaining nullable malformed-structure findings; treat readable incoming references as applicability evidence for malformed target types; expose unsupported path evidence without enqueueing segments or supported stale/collision predicates; and compare labels against all unrelated semantic node bodies while preserving own-node and ancestor exclusions. Expand the public matrix with direct and parseable-note/package interaction cases, audit adjacent nullable/unlocatable/unsupported/incoming/leaf-only consumers, preserve generated-artifact ownership and protected scope, commit rollback-safe checkpoints, and rerun every required focused and complete gate.

PREREQUISITE-TOTALITY CLOSURE (2026-08-26)\n\nAfter rejected head a1a1b941e83b9d26b70593cc5d8fd24714691a99, close four source-verified shared-rule defects without changing the public inspectBoard interface. Use the same finite-coordinate rule for identity fallback, render evidence, absolute path derivation, and segment eligibility; make endpoint binding classification an explicit prerequisite for node penetration; centralize label ownership classification in the inspection model for diagnostics and collision exclusions; and add a closed BROKEN_REFERENCE reason for readable boundElements target-type mismatch. Drive each change through public direct and persisted/package cases, then add a bounded deterministic cross-product matrix over identity, coordinate, path, endpoint, ownership, and target-type states. Preserve generated ownership and all protected scope. Commit rollback-safe checkpoints and rerun the complete required focused, fixer, generator, repository, and sequential browser gates.

### AGGREGATE/IDENTITY TOTALITY CLOSURE

1. Replace duplicate per-record render checks with the strict ingest collector as the shared field-validity rule, while keeping derived span and hierarchy arithmetic inspection-only.
2. Add a closed aggregate-coordinate finding and an explicit aggregate result used by node, obstacle, and affected-union construction. Failed aggregates retain finite constituent evidence and exclude only dependent aggregate consumers.
3. Compute unique usable IDs once and thread that eligibility through every identity-dependent model and detector producer.
4. Centralize bound-element compatibility, including declared arrow to actual line, and replace hierarchy area multiplication with an overflow-safe finite-box comparison.
5. Expand direct and persisted public cross-products, then run focused and complete validation without changing generated ownership or protected scope.

### Numeric-domain amendment approved by parent

Ordinary focus-safe affected boxes keep the exact 16 px expansion. When a finite affectedBBox cannot produce finite coordinates with exact 16 px deltas, inspection keeps affectedBBox, sets focusBBox to null, and emits a fixed-warning coverage-affecting AMBIGUOUS_GEOMETRY/unrepresentable-focus-padding finding. Coverage is indeterminate and strict check exits 8. This replaces only the former rule that affectedBBox and focusBBox became null together for unlocatable evidence.

### Numeric-domain and preprocessing-bounds closure

1. Add public red cases for focus padding, exact hierarchy area order, local evidence fallback, limit span closure, large-cardinality extrema, and linear obstacle grouping.
2. Introduce shared internal classifications for local evidence boxes, aggregate boxes, and focus padding while keeping inspectBoard as the only inspection interface.
3. Replace hierarchy multiplication and variadic extrema with total iterative arithmetic.
4. Index obstacle candidates by group membership and union only records sharing a group.
5. Expand direct and persisted/package cross-products, then run every focused and complete gate without changing generated ownership or protected scope.

### Parent-approved schema-v1 obstacle identity amendment

Legal element IDs may contain commas, so the former literal comma join is ambiguous and cannot serve as a deterministic obstacle identity. Schema version 1 now uses this exact grammar: sort constituent elementIds with the exact UTF-16 code-unit comparator; in each ID replace every backslash with two backslashes and every comma with backslash-comma; join the encoded IDs with a literal comma; prefix the result with the literal obstacle:. No other character is escaped. NUL, other controls, lone surrogates, and shared prefixes remain exact. The inspection schema verifies that obstacle id is precisely this encoding of elementIds. Model construction, schemas, formatter output, JSON/text documentation, and tests consume one owner for the grammar. Direct and persisted/package cases cover comma, backslash, combined backslash-comma, controls, empty-looking prefixes, reversed input, and pairs that collided under the raw join.

27. Parent-approved preprocessing-ceiling amendment (2026-08-27). The xhigh architecture reviewer in thread 01a03e0f-61d1-78d3-af62-04cefac7760e returned PLAN_AMENDMENT_RECOMMENDED against fixed base 963c3f0c5dadd3687a30d5133437e822427da582 and rejected head 688d27ce5cf01c1a38c70a22f1ff57c67b16c24a; the parent approved the amendment. The arbitrary dynamic two-sided compatibility relation has no reasonable TASK-119-grade linear-space O(log N + output) implementation. Supersede the preprocessing O(N log N + A) guarantee with one deterministic schema-v1 preprocessing work budget of 25,000,000 logical units, separate from the unchanged 2,000,000 eligible broad-phase comparison ceiling. The shared budget spans model and pair preprocessing, charges once at each primitive owner for consumed interval/profile/exclusion/ancestor input, inspected identity UTF-16 code units, owned stable-order comparisons, index/heap/trie/list/bucket/cell reads and rewrites, Map/Set operations, candidate/intersection work, and hierarchy traversal, while A-attributed candidate delivery and downstream broad-phase/exact predicate work remain excluded. On attempted unit 25,000,001, do not execute that unit; abort remaining model/pair passes and emit exactly one closed warning coverage-affecting INSPECTION_LIMIT_EXCEEDED/broad-phase-preprocessing-ceiling finding. The first attempted preprocessing or comparison ceiling wins, never both. Reports publish both limit constants but no actual preprocessing count; development diagnostics retain detailed mechanics. Strict check exits 8 with the report and non-strict exits 0. Preserve completed structural findings and comparisons, exact deterministic evidence ownership, current focus/aggregate behavior, and all protected scope. Define semantic input size explicitly as I + E + H, where I is interval count, E is the total exact-exclusion entries across profiles, and H is the total ancestor-target entries. The retained-memory contract is O(I + E + H) references plus emitted findings; any plan use of N for this preprocessing contract means I + E + H, not interval count alone. Identity UTF-16 code units are logical-budget work when read or compared. Validate many-exclusion and many-ancestor families by gating peak retained references against I + E + H; the alternating counterexample remains linear semantic input because E = I.

28. Parent-approved auditable budget amendment (2026-08-27). The xhigh architecture reviewer in thread 01a03e0f-61d1-78d3-af62-04cefac7760e returned PLAN_AMENDMENT_RECOMMENDED against fixed base 963c3f0c5dadd3687a30d5133437e822427da582 and rejected head ff2a3bbb7516633606c6ec3e6e79d729f40fec87; the parent approved this amendment. Step 28 supersedes step 27 exact JavaScript primitive accounting, PreprocessingOperations wrappers, stablePreprocessingSort and comparePreprocessingIdentity, regex source audit, exact Map/Set/iterator/cell arithmetic, and micro-reference diagnostics. Schema version 1 remains unreleased.

Expose INSPECTION_INPUT_COMPLEXITY_LIMIT = 1,000,000, INSPECTION_ANALYSIS_WORK_LIMIT = 25,000,000, and the unchanged BROAD_PHASE_COMPARISON_LIMIT = 2,000,000. Report limits become inputComplexityUnits, analysisWorkItems, and broadPhaseComparisons. Remove BROAD_PHASE_PREPROCESSING_LIMIT, broadPhasePreprocessingSteps, aliases, and broad-phase-preprocessing-ceiling.

Before decode or any access to raw records, snapshotInspectionInput receives readonly unknown[] and produces closed inert snapshot records. It rejects proxies before other operations, walks iteratively with fixed field lists, descriptors, prototype checks, and active-path cycle detection, follows only arrays and plain or null-prototype objects, ignores symbol and uninspected keys, and never invokes accessors, iterators, serialization hooks, structuredClone, or raw value coercion. Every closed snapshot field is required with an unknown or undefined value. Input units charge record slots, admitted own data properties, followed array slots, and followed string UTF-16 code units. Shared values charge per occurrence. Bulk string and array claims refuse before admission, sparse arrays charge logical slots, and attempted limit is exactly 1,000,001.

Add INVALID_RENDER_GEOMETRY/non-data-input for inspection-relevant proxies, accessors, cycles, functions, symbols, bigint values, and non-plain objects. It is a fixed error that affects coverage, records a nullable sourceIndex, path tokens, and a closed issue. Blocked records never enter detectors. Add INSPECTION_LIMIT_EXCEEDED/input-complexity-ceiling with fixed limit and attempted values, input-scan and snapshot-input ownership, completed record count, nullable source index, path, and unit kind. Input scanning runs first, semantic analysis never runs on a partial snapshot, and broadPhaseComparisons remains zero.

Replace PreprocessingBudget and PreprocessingOperations with a small InspectionBudget that owns claimInput and claimWork plus typed stop records. One shared owner table contains record-analysis, node-hierarchy, container-boundary, connector-node, connector-obstacle, connector-intersection, node-overlap, label-node-overlap, label-label-overlap, and finding-finalization. Work items are domain records, entries, points, segments, findings, refs, model members, aggregate and hierarchy candidates, prepared or active sweep events, index nodes, and compatibility or intersection candidates. Owner loops claim immediately before processing. A K-item helper claims K in bulk before starting. Stable native sorting claims K * ceil(log2(K)) for K at least 2, with saturated arithmetic and refusal before sorting. VM collection mechanics and post-snapshot identity reads are not public units. Eligible pair delivery remains owned only by broadPhaseComparisons.

Replace the old preprocessing finding with INSPECTION_LIMIT_EXCEEDED/analysis-work-ceiling. It reports limit 25,000,000, attempted 25,000,001, the closed owner and phase, completedInputUnits, completedBroadPhaseComparisons, processed record count, and segment, node, obstacle, and label counts. Preserve participant refs and evidence boxes for unfinished passes. Bulk helpers and multi-cell mutations are atomic. Per-item findings and comparisons commit only after the item finishes. A stopped helper contributes no partial diagnostic delta, but earlier completed findings, comparisons, and diagnostics remain. The first input, analysis, or comparison ceiling attempted wins and exactly one limit finding appears. Both new reasons produce indeterminate coverage, strict exit 8 with report stdout, and non-strict exit 0.

Delete primitive wrappers, primitive arithmetic tests, the regex audit, and exact simultaneous-reference equations. Restore ordinary arrays, Map/Set, exact identity owners, and native stable sorting after owner-level claims. Retain only development diagnostics for inputUnits, analysisWorkItems, broad-phase events, compatible visits, expiry, bucket scans, exact-query and hierarchy-node visits, pathSegmentChecks, and coarse active bucket, profile, and index-node peaks sampled at completed item boundaries. Remove exact collection/cell counters and VM-coverage claims. Boundary checks prove raw unknown input crosses snapshotInspectionInput, later modules accept only closed snapshots, and old symbols are absent.

Validate exact input string and array boundaries, sparse arrays, holes, controls, lone surrogates, revoked and nested proxies, zero-hit accessors, cycles, custom prototypes, unsafe scalar values, direct and persisted package paths, zero side effects, and strict normal I/O. Keep the 250,000-point supported control below input limit and turn the 750,000-point stress into an input-limit case. Keep 2,048 alternating exclusions below analysis limit, 3,072 at attempted 25,000,001 in both orientations, the dense 1,516,200 complete count, comparison-first attempt 2,000,001, and partial-result preservation when a later analysis limit follows a completed penetration or comparison. Diagnostics assert semantic bounds, not primitive arithmetic.

Preserve contract 58 and immutable 57 records, vault-direct read and no side effects, compare bytes and dense reroute, generated views absent and ignored with canonical audit JSON tracked, strict normal read/write behavior, converter, lock, claim, version and ID behavior, TASK-128, released skills, and all TASK-090, TASK-120, and TASK-123.03 protected boundaries.

29. Parent-approved removal of the failed universal analysis-work guarantee (2026-08-27). This step supersedes step 28 only where step 28 introduced INSPECTION_ANALYSIS_WORK_LIMIT, analysis-work-ceiling, universal analysis-work claims/counters, owner/phase enums, three-limit precedence, and complexity evidence. Retain the inert descriptor-based input snapshot and exact 1,000,000 input-complexity ceiling unchanged. Retain exact semantic broad-phase comparison counting and the 2,000,000 comparison ceiling unchanged. Public report limits become exactly inputComplexityUnits and broadPhaseComparisons. Delete the universal analysis budget, its finding variant, all claim plumbing, and contractual analysis-work diagnostics rather than replacing them with another budget, timer, counter, source audit, or runtime guarantee. Keep useful coarse development-only algorithm diagnostics. Document that the two retained ceilings are truthful capacity safeguards, not a general runtime, asymptotic, hang, or denial-of-service guarantee: valid capped input may still induce superlinear semantic work, and external termination emits no inspection report. Preserve every semantic correction established during remediation, contract 58 and the immutable ordered 57-path subset, direct vault reads, strict normal I/O, no-side-effect behavior, generated ownership, and all protected TASK-090/TASK-120/TASK-123.03/TASK-128 scope. Architecture source: xhigh plan review thread 01a03e0f-61d1-78d3-af62-04cefac7760e. Fixed base 963c3f0c5dadd3687a30d5133437e822427da582; rejected head a9b0fa3dd9c8f16ab80a99d45c77a8b64656282c; parent approval explicitly granted.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 1: extracted the shared architecture-facts entrypoint and adapted compare without changing its semantic model. bun run type-check, bun run test:branch, and git diff --check passed; branch coverage retained promoted stencil nodes, promoted connectors, warnings, node order, and edge facts.

Checkpoint 2: added the closed schema-v1 inspection report and finding union, raw-record decoding, deterministic node/zone/obstacle modeling, persisted-font and label checks, supported geometry predicates, broad-phase counting with the 2,000,000 ceiling, exact affected/focus boxes, and deterministic sorting. type-check, geometry, labels, branch, boundaries, module-scope, and diff checks passed.

Checkpoint 3: added the inspection-only raw note reader and contract-backed check command. The command has local-read only, no REST relationships or server/browser prerequisite, JSON/text output, policy flags, and strict stdout outcomes 6/7/8. type-check and direct generated help smoke checks passed.

Checkpoint 4: added dense before/after and pinned compare fixtures, pure and package-boundary inspection checks, exact broad-phase performance gates, strict normal-ingest evidence, no-side-effect vault snapshots, and negative-path browser fixed-point coverage. test:inspection (27 checks), type-check, test:suites, and diff checks passed.

Checkpoint 5: extended current contract metadata to 34 commands and 58 paths while preserving the immutable 57-path compatibility subset. Added check-specific schema/effect/outcome assertions, exact general-help normalization, generated audit/proof files, and check outcome documentation. generator --check, test:contracts (58 proofs/969 checks), test:cli (579 checks), and diff checks passed.

Paused for urgent skill-lint regression after all five approved implementation checkpoints were committed. Completed validation: type-check; test:inspection (27 checks); test:geometry; test:labels; test:branch; test:boundaries; test:module-scope; test:suites; generator --check; test:contracts (58 proofs/969 checks); test:cli (579 checks); and git diff --check at the recorded checkpoints. The first required bun run fix stopped before formatting because inspection lint found several issues. The cleanup checkpoint resolves every reported issue except structuralFindings complexity 150 versus the repository limit 60; focused type-check and diff checks pass, while focused bunx oxlint reports only that remaining complexity error. Remaining on resume: split structuralFindings without disabling lint, complete two stable fix passes, focused matrix, sequential fixed-point browser evidence, bun run check, separate bun run test, clean committed worktree, and independent fixed-range review. Work paused at a clean checkpoint for the urgent distributable-skill lint regression.

Resume checkpoint: decomposed structuralFindings into private geometry, binding, reference, metadata, font, and unsupported-geometry helpers while preserving the pure inspection interface and detector order. test:inspection still reports 27 checks, both TypeScript projects pass, and bun run lint passes without a complexity waiver. The lint command ran the TASK-128 distributable-skill validator successfully before oxlint. bun run fix passed twice; both passes ran the skill validator before and after formatting, and pass 2 preserved the exact binary worktree diff hash d640f622c318bfbc68fe68a83f91f263ee79dc62bf5a1f33a7f613ce351896d6 and identical porcelain status. The first fixer pass applied canonical formatting to existing TASK-119 source, test, fixture, and contract paths. No TASK-128-owned path changed. Remaining work is the approved focused matrix, sequential browser evidence, bun run check, separate bun run test, final clean commit state, and independent fixed-range review.

Formatter-fixture correction: the dense compare fixture pins the two-space JSON bytes emitted by command presentation, while oxfmt uses repository tabs for JSON. Added a one-path formatter ignore and restored the fixture's canonical bytes. test:inspection passes all 27 checks after a real fix pass. A second real fix pass preserved the exact binary diff and porcelain status at hash 8c8126a61dd4a563efb79968c935467a23ce32025102e8c4879bc1a0dbb69a1e; type-check, lint including the skill validator, and git diff --check also pass.

Browser validation: the first sequential chain exposed two stale fixed-point recovery assertions that still expected 12 elements after the approved negative-relative-point connector raised the fixture to 13. The failure did not contradict renderer bounds or path assumptions: the browser and server both held all 13 elements and reported zero element changes. Updated only those two expected counts. An isolated test:browser rerun passed, then the required complete headless sequence passed in order: test:human-performance, test:browser, test:typing, and test:live-session. Fixed-point evidence is 0 of 13 elements changed; the negative straight path round-trips unchanged.

Final implementation validation: the full focused matrix passed, including type-check, test:suites, boundaries, module-scope, contracts and generator check, inspection, CLI, Obsidian/no-side-effect, changes, one-write, geometry, labels, library, boards, and branch compare. After the fixed-point cardinality correction, the complete four-suite browser chain passed sequentially and headless. bun run check then passed lint, skill validation, format verification, both TypeScript projects, all 29 push suites, and all four browser suites. A separate bun run test also passed the complete suite and its own sequential browser chain. No gate was waived or skipped; fixed-point remained 0 of 13 elements changed.

Review remediation checkpoint: fixed all independently verified findings without changing protected scope. Penetration tolerance is now applied once with exact/inside/outside public cases; malformed angles and applicable type discriminators produce coverage-affecting unsupported findings; invalid library rescue uses the model's qualifying multi-member grouped-body classification; every finding schema fixes severity and coverage literals, including closed data-dependent subvariants; producer inputs are a discriminated union; check validates policy before vault access; finding order uses the approved declared reason and ref/point/box sequence; unsupported connectors expose decoded absolute path points and extents; and text formatting is compile-time exhaustive by code and reason. The matrix grew from 27 checks at rejected review to 357 checks and covers all closed schema branches with impossible-pair rejection, all intended invalid-id roles, path/binding/reference closures, malformed applicable geometry, exact tolerances, persisted fonts, bound-label semantics, obstacle and actual-boundary zone cases, deterministic ordering/counts/limit, dense reroute, deep mutation traps, real-package malformed notes, zero HTTP, strict exits, and unchanged vault paths/bytes/mtimes. The expansion also found and fixed an order-dependent grouped-obstacle union root and prevented unlocatable paths from inventing coordinates. At commit f5971c4, bun run lint, both TypeScript projects, test:inspection (357 checks), and git diff --check pass. TASK-119 remains In Progress with acceptance criteria unchecked. Remaining validation: approved focused matrix, two byte-stable fix passes, generator check, bun run check, separate bun run test, and final clean-state evidence.

Review-remediation scope amended by direct user instruction: generated CLI audit/proof views are now on-demand ignored outputs, while cli-command-audit.json remains the canonical authored input. Implementation is proceeding under the appended plan amendment without reopening TASK-128 or changing protected runtime behavior.

Review-remediation closure after the generated-ownership amendment: commit 9683eb7 keeps docs/design/cli-command-audit.json as the canonical authored input, removes the three reproducible views from tracking, renders them on demand under ignored docs/design/generated/, and validates their live projection plus two absent-directory byte-identical generations without touching the checkout. Final gates on the committed tree: two bun run fix passes both produced the empty SHA-256 diff e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855; bun run check passed; a separate bun run test passed; both full chains ran all four browser suites sequentially/headless, with fixed-point 0 of 13 changed and live-session 42 of 42 cycles converged. The earlier separate-test human-performance failure was isolated per docs/agents/test-suite.md, its browser-created text correction was diagnosed without retaining instrumentation, the isolated rerun passed, and both required complete chains then passed. TASK-119 remains In Progress with every acceptance criterion unchecked for independent rereview.

Final rereview remediation started from clean 1c293b7 with fixed base 963c3f0. Test seams remain the pure inspectBoard readonly-unknown interface and the real package CLI over parseable notes. TASK-119 stays In Progress with all acceptance criteria unchecked.

Final interaction remediation checkpoint: split relative path structure from nullable absolute scene coordinates, and gated pair/stale analysis on a canonical id, finite two-coordinate origin, supported discriminator set, and usable path. Invalid-id connectors now retain nullable malformed binding/path evidence but skip readable binding, persisted endpoint, dangling entry, stale, and pair producers. Readable incoming binding/container/bound references make malformed target types coverage-applicable. Label-node overlap now considers every semantic node body while connector penetration and node overlap retain leaf scope. The public direct/package matrix grew to 376 checks, including unlocatable collision traps, missing/empty/non-string identity interactions, forward-only malformed target types, every unsupported connector discriminator, and unrelated non-leaf zone label overlap. bun run lint, both TypeScript projects, test:inspection, and git diff --check pass.

Final interaction remediation validation closure: commits c9a483e and 8dc887d close all five rereview findings and retain the user-directed generated ownership. Focused lint, type-check, boundaries, module-scope, contracts (58 proofs/58 audited paths/978 checks), inspection (376 checks), CLI (579 checks), geometry (89 checks), labels (183 checks), and branch gates passed. Two real bun run fix passes both ran the TASK-128 skill validator and produced the identical binary diff hash 61f2b68af759f68813a87b131f8e7a472cd841c2b8d2cc7bf2c7b01976b7ef25; their deterministic formatter output is committed. Two fresh temporary on-demand contract generations were byte-identical, produced the three expected derived views, and left no checkout output. bun run check passed the complete 29-suite chain and all four browser suites sequentially/headless; a separate bun run test then passed the same complete chain. Both browser chains retained fixed-point 0 of 13 changed, 10,000-element human responsiveness, complete typed-text round trips, and live-session 42 of 42 convergence. git diff --check passes. TASK-119 remains In Progress with all acceptance criteria unchecked for independent rereview.

Prerequisite-totality remediation started from clean a1a1b94 with fixed base 963c3f0. Approved test seams remain the pure inspectBoard readonly-unknown interface and the real package CLI over parseable notes. TASK-119 stays In Progress with every acceptance criterion unchecked.

### Prerequisite-totality closure implementation

Centralized binding target, boundElements, connector endpoint, and label ownership prerequisite classification in the inspection model. Non-finite identity fallback coordinates and overflowed absolute path arithmetic now remain schema-total with finite-prefix evidence or null boxes. Blocking endpoint structures suppress only connector-to-node analysis; reverse-only label ownership participates consistently, while conflicting or malformed ownership blocks unresolved layout claims. Readable boundElements entries now validate declared text/arrow discriminators against known target types through a new closed coverage-affecting reason.

Expanded the public production test to 514 checks: NaN and both infinities on both axes across invalid identities; finite MAX_VALUE addition overflow; every blocking endpoint on start, end, and both; forward/reverse/matching/conflicting/malformed ownership; known target discriminator cross-products; raw JSON 1e400 package evidence; and a deterministic 80-case prerequisite matrix proving no throws, schema validity, indeterminate coverage, and dependent-layout suppression. Persisted package evidence includes every known text/arrow/rectangle mismatch and matching pair.

Focused validation green: lint (including distributable skill validation), type-check, boundaries, module-scope/self-test, 58-path contracts (978 checks), inspection (514), geometry (89), labels (183), branch, and CLI surface (579). Two real bun run fix passes were byte-stable at diff hash 0d68720500036750dea4922b3fccfa78c2d26a92. Full bun run check and separate bun run test remain to run after the remediation checkpoint.

### Prerequisite-totality closure validation

Committed remediation as 4dc8427. `bun run check` completed green, followed by a separate complete `bun run test`; each ran all four browser suites sequentially and headless. Human-performance held the 10,000-element board responsive, fixed-point returned 0/13 changed elements, typed-text preserved both rename interactions, and live-session converged through all 42 mixed-write cycles.

The on-demand CLI-contract renderer succeeded from an absent generated-output directory into two independent temporary directories. All three derived views (`cli-command-audit.md`, `command-contract-proof.json`, and `command-contract-proof.md`) were byte-identical between runs and left no checkout output. The canonical authored `docs/design/cli-command-audit.json` remains tracked; generated ownership is unchanged. `git diff --check` passed. TASK-119 intentionally remains In Progress with every acceptance criterion unchecked pending independent rereview.

Aggregate/identity totality remediation started from clean rejected head 0766f143b95d2e22edbcba8ed8d250b5ebc2179b. Fixed base remains an ancestor. TASK-119 stays In Progress with acceptance criteria unchecked.

### Aggregate/identity totality implementation

Added one explicit aggregate-box classification that distinguishes empty input, a finite representable union, and finite constituents whose span cannot be represented. Node bodies, node aggregates, grouped/library obstacles, broad-phase affected regions, and multi-record finding unions now consume that result. The closed warning `AMBIGUOUS_GEOMETRY/unrepresentable-coordinate-span` is coverage-affecting, source-indexed, formatter-exhaustive, and keeps a finite local constituent box when one combined box is impossible. Failed node-body and obstacle aggregates are excluded from their dependent pair consumers; node aggregate-only failure does not discard a valid node body.

Decoded records now compute unique usable IDs once. Duplicate groups stay available for source-indexed render and structural evidence but cannot enter maps, node membership, endpoint resolution, label ownership, obstacle identity, connector segments, reference resolution, or pair analysis. Bound-element compatibility is centralized: text accepts text; arrow accepts arrow or line. Hierarchy area ordering now compares normalized exponent/mantissa keys instead of multiplying widths and heights.

The strict render collector is the single x/y/width/height field classifier used by inspection decoding. Direct equivalence cases cover finite, missing, nonfinite, negative, zero, extreme, and derived-overflow records. Derived extent and multi-record span failures remain inspection-only.

The public production suite now has 553 checks. New evidence includes a bounded 9-case aggregate cross-product, six duplicate-role cross-products, the full 8-case text/arrow against text/arrow/line/rectangle table, line reciprocity, semantic/grouped/library/duplicate affected overflows, raw persisted plus/minus MAX_VALUE cases, MAX_VALUE and tiny-by-huge hierarchy arithmetic, equal-area tie order, nested-zone leaf/endpoint/ancestor behavior, and source-indexed duplicate structural findings. Focused lint, type, boundaries, module-scope, contracts, inspection, geometry, labels, branch, and CLI gates are green. Two real fixer passes were byte-stable at d0319cfe748d0533e6db747f13b350271c0edbcc.

### Aggregate/identity totality closure — final validation (2026-08-26)

- Committed checkpoint `e4b7fd7` centralizes aggregate coordinate classification, unique usable identity, bound-element compatibility, overflow-safe hierarchy ordering, and per-record render prerequisites.
- Public inspection matrix: 553 checks. Added direct and persisted/package cross-products for semantic-node, grouped/library obstacle, duplicate-id, line compatibility, hierarchy arithmetic, and strict-render equivalence. Reports remain schema-valid and dependent layout facts are suppressed after failed prerequisites.
- Focused gates passed: lint, type-check, boundaries, module-scope/self-test, 58-path contracts (978 checks), inspection, CLI (579 checks), geometry, labels, and branch.
- `bun run fix` passed twice with identical post-pass diff hash `d0319cfe748d0533e6db747f13b350271c0edbcc`; the distributable-skill validator ran and passed in both commands.
- Full `bun run check` passed, including four sequential headless browser suites. Separate full `bun run test` passed, including the same browser chain.
- On-demand contract generation produced identical bytes in two fresh temporary output directories: audit Markdown 33,383 bytes, proof JSON 653,879 bytes, proof Markdown 453,379 bytes. `docs/design/generated` remains absent; canonical `docs/design/cli-command-audit.json` remains tracked.
- `git diff --check` passed. TASK-119 remains In Progress with every acceptance criterion unchecked pending independent rereview.

Numeric-domain remediation started from clean rejected head 0f0fa84 with fixed base 963c3f0. Public test seams remain inspectBoard over readonly unknown records and the real package CLI over persisted notes. TASK-119 remains In Progress with every acceptance criterion unchecked.

### Numeric-domain and preprocessing-bounds implementation

Added the parent-approved focus contract: ordinary findings retain exact 16 px focus expansion; an unrepresentable exact delta keeps affectedBBox, sets focusBBox to null, and adds the closed warning AMBIGUOUS_GEOMETRY/unrepresentable-focus-padding with literal padding and enumerated failed deltas.

Decoded records now carry one local evidence box independent of model extent eligibility. Every finite x/y record keeps either its representable stored box or a zero-area origin fallback. Structural, identity, font, library, label, unsupported, reference, aggregate, and limit findings use that evidence without admitting unusable extents into collision modeling.

Hierarchy area order now compares exact binary significand products with BigInt and never constructs overflowing powers. Aggregate and point extrema are iterative. Limit findings retain one stable ref per locatable input so opposite-extreme span closure remains explicit. Obstacle grouping indexes group ids and unions only shared memberships; the 2,000-record public probe dropped from 4,002,000 group reads to exactly 4,000 while preserving library singletons and multi-group transitivity.

The public production matrix has 583 checks. It covers MAX_VALUE mantissas, equal extreme products in both input orders, subnormals, focus failures from origins, points, aggregates and limits, exact normal deltas, extent-overflow interactions across independent producers, a 750,000-point cardinality case, the exact 2,000,001 limit with opposite extremes, and direct plus persisted/package strict evidence. Focused lint, both TypeScript projects, boundaries, module-scope, contracts, inspection, geometry, labels, branch, and CLI gates pass. Two final fixer passes were byte-stable at cac2514da69982c7766c57b47590afec40734c6d163f1427e8c0260e4c6800c4.

### Numeric-domain closure validation

Commit 3595883 closes numeric-domain and preprocessing bounds without changing the public inspection interface or protected runtime behavior. The public inspection matrix passes 583 checks. Focused lint, both TypeScript projects, boundaries, module-scope and self-test, 58-path contracts with 978 checks, CLI with 579 checks, geometry with 89 checks, labels with 183 checks, branch, persisted package cases, and git diff checks are green.

Two final bun run fix passes both ran the distributable-skill validator and preserved the exact diff hash cac2514da69982c7766c57b47590afec40734c6d163f1427e8c0260e4c6800c4. Complete bun run check passed, followed by a separate complete bun run test. Each chain ran all four browser suites sequentially and headless. Fixed-point remained 0 of 13 changed, the 10,000-element human case stayed responsive, typed text survived both rename interactions, and live-session converged through all 42 mixed-write cycles.

Two fresh on-demand contract generations were byte-identical: audit Markdown 33,383 bytes, proof JSON 660,919 bytes, and proof Markdown 459,580 bytes. The checkout contains no generated output, canonical docs/design/cli-command-audit.json remains tracked, and the worktree was clean before this Backlog note. TASK-119 remains In Progress with every acceptance criterion unchecked for independent rereview.

Bounded-sweep closure checkpoint: replaced repeated cross-set pair scans and every-node hierarchy scans with one private deterministic minX/maxX event sweep using heap expiry and stable active lists. Eligibility still precedes broadPhaseComparisons, which still increments before y/exact predicates and preserves the exact 1,516,200 and 2,000,001 fixtures. Limit refs and coordinate-span evidence now come only from participating segment, node, obstacle, and label records. Shared linear path measurement uses iterative extrema, zero-segment filtering uses constant-time membership, and the public report exposes deterministic preprocessing work counts. Public tests cover sparse 1k/2k/4k scaling, dense counts, supported 750,000-point stale measurement, repeated-point filtering, unrelated extreme limit records, actual extreme participants, and real-package persisted large paths. Two bun run fix passes were byte-stable at diff hash 890d83be5cab3b18b7f9f739c56f331b5b460d892fc04fad8aaa764f5141d7fc. Focused lint, both TypeScript projects, inspection 586 checks, contracts 58 proofs/978 checks, CLI 579 checks, boundaries, module-scope, geometry, labels, library, boards, branch, Obsidian, changes, one-write, and git diff --check pass. Remaining: commit this checkpoint, bun run check, separate bun run test, sequential browser evidence within both chains, final generator/status/diff checks, and clean-tree callback.

Bounded-sweep closure validation: commit 21df1a2 passes the complete required validation. bun run check passed lint and distributable-skill validation, format verification, both TypeScript projects, all 29 push suites, and the four browser suites sequentially/headless. A separate bun run test passed the same complete suite and sequential browser chain. Both browser chains reported fixed-point 0 of 13 elements changed, the 10,000-element human board remained responsive, typed text survived both rename interactions, and live-session converged through 42 of 42 mixed-write cycles. Inspection passes 586 checks while retaining exact broad-phase counts 1,516,200 and 2,000,001. Two explicit on-demand generations from absent output directories were byte-identical: cli-command-audit.md 33,383 bytes, command-contract-proof.json 662,300 bytes, and command-contract-proof.md 460,808 bytes. Generated views remain outside the checkout; docs/design/cli-command-audit.json remains the tracked canonical input. TASK-119 remains In Progress with all acceptance criteria unchecked. No protected TASK-090/TASK-120/TASK-123.03, route, UI, session, persistence, write, or released-skill behavior changed.

Semantic-sweep closure (2026-08-26):
- Replaced post-enumeration eligibility with caller-owned semantic partitions and cached exclusion sets. Same-connector segments, same-owner labels, connector endpoint/ancestor nodes, and label owner/ancestor nodes are excluded before the pair visitor and before broadPhaseComparisons.
- Removed preprocessingWork from schema-v1 reports and package output. Added the pure module-root diagnostics entrypoint for development-only event, compatible-visit, expiry, partition, hierarchy, and path counters.
- Added public/diagnostic scaling coverage through 1k/2k/4k/8k same-connector segments, dense multi-connector counts, endpoint/ancestor and label-owner A=0 cases, and randomized brute-force differential checks.
- Updated boundary, test-suite, and contract-design documentation. Generated proofs remain on-demand and ignored; canonical audit JSON remains tracked.
Focused validation green: type-check, lint (including distributable skill validation), inspection (599 checks), contracts (58 proofs / 978 checks), CLI (579 checks), boundaries, module-scope, geometry, labels, branch, library, boards, Obsidian, changes, one-write, and suite-chain. Two bun run fix passes were byte-stable at diff SHA-256 3652396bdd9b0b2d3218c831f16599e6f5b98732967095b793046f67ef4fe5bd. Full check and separate full test remain.

Semantic-sweep closure validation (2026-08-26):
- Checkpoint 5cf51b7 implements semantic partitioning before pair visitation and removes private preprocessing work from schema-v1/package output behind the pure module-root diagnostics interface.
- The first full check reached human-performance and observed one overlapping acknowledgement sample with replacement count 2; isolated diagnosis immediately passed with ordinary acknowledgement replacements [0,0]. No source change was made. The required complete bun run check rerun then passed.
- Complete bun run check and a separate complete bun run test are green. Both ran human-performance, fixed-point, typed-text, and live-session sequentially/headless; fixed-point returned 0/13 changed elements and live-session converged through 42/42 cycles.
- Two independent on-demand generations produced identical cli-command-audit.md, command-contract-proof.json, and command-contract-proof.md bytes. SHA-256 values were c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, ca5e28eeee97dcbea9d58b31e912679ad069c89f0f7fc2ba318afe6c9d0e4e1f, and 63449ca7440f77b714248e3e8bf9c87c3b0e520e8b070b41fc2a740aca41f7e5 respectively. Generated files remained outside the checkout.
- TASK-119 remains In Progress with all acceptance criteria unchecked for independent rereview.

Partition-identity remediation checkpoint (2026-08-26):
- Replaced NUL-delimited semantic bucket keys with a nested exact-string index over the partition and sorted exclusion strings. Legal persisted IDs, including escaped control characters, cannot alias structural buckets.
- Expiry now removes an empty active list, prunes its exact index path, and deletes an empty partition root. Pair enumeration visits only active buckets.
- Development diagnostics now expose bucket scans and exact index operations for broad-phase and hierarchy work. These counters remain absent from InspectionReport, CheckResult, JSON, and text output.
- The public matrix has 602 checks. Direct and real persisted/package cases cover eligible and excluded connector-node, label-node, node hierarchy, connector same-set, and label same-set behavior with control-character IDs, plus the reported connector-node collision and a renamed control. Sparse distinct-partition runs at 1k/2k/4k/8k report zero broad-phase bucket scans and linearly bounded exact index operations.
- Focused lint, both TypeScript projects, boundaries, module-scope, contracts, inspection/package, CLI, geometry, labels, branch, and git diff checks pass. Two bun run fix passes were byte-stable at diff SHA-256 6923f4cffe44ec6ee5ba2ba3bc5ead92f28f26819d67aeaa81ab45dd5e30b6da. Full check and separate full test remain.

Partition-identity remediation validation (2026-08-26):
- Commit 9fd5036 closes the control-character bucket alias and historical empty-bucket scan defects without narrowing persisted IDs or changing semantic pair eligibility.
- Complete bun run check passed lint, skill validation, formatting, both TypeScript projects, all 29 push suites, and the four browser suites sequentially/headless. A separate complete bun run test passed the same suite and browser chain. Fixed-point returned 0 of 13 changed elements and both live-session runs converged through 42 of 42 cycles.
- Inspection passes 602 checks while preserving the exact 1,516,200 and 2,000,001 comparison fixtures. Public report bytes and schemas still omit every preprocessing counter.
- Two independent on-demand generations were byte-identical: cli-command-audit.md c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, command-contract-proof.json ca5e28eeee97dcbea9d58b31e912679ad069c89f0f7fc2ba318afe6c9d0e4e1f, and command-contract-proof.md 63449ca7440f77b714248e3e8bf9c87c3b0e520e8b070b41fc2a740aca41f7e5. Generated views remained outside the checkout; the canonical audit JSON remains tracked.
- TASK-119 remains In Progress with every acceptance criterion unchecked for independent rereview.

### Compatible-bucket and exact-identity remediation

Commit d09f6d7 replaces active-bucket scans with exact-string canonical compatibility profiles and incrementally maintained compatible bucket indexes. Identical label ownership exclusions share one transitive set and one sweep profile, so deep own-plus-ancestor label cases no longer copy or traverse the same hierarchy per label. Empty compatibility groups are removed on expiry. Every compatibility-group and returned-bucket iteration remains visible in the module-root diagnostics, which now also reports canonical profile counts. Hierarchy child/owner self-pairs carry reciprocal exclusions and never reach candidate visitation.

One exact UTF-16 code-unit comparator now owns identity sorting and tie breaks across sweep events, hierarchy selection, node and obstacle refs, obstacle components, and final finding arrays. Caller-controlled identity arrays are compared structurally; obstacle string identities use an injective escaped encoding. No board-inspection semantic path retains localeCompare or NUL-delimited composite keys.

The public inspection matrix has 607 checks. New direct and real persisted/package cases cover NUL, other controls, shared prefixes, and lone surrogates across connector-node, label-node, node, connector same-set, label same-set, equal-area hierarchy selection, leaf status, ancestor exclusion, and finding order. Exclusion-heavy 1k/2k/4k/8k label and connector cases pin zero semantic comparisons/compatible visits, bounded bucket scans and index operations, and canonical profile reuse; sparse isolated hierarchy cases pin zero candidate visits. Exact 1,516,200 and 2,000,001 public comparison fixtures remain green. Focused lint, type-check, boundaries, module-scope, contracts, geometry, labels, branch, CLI, inspection/package, two byte-stable fix passes at diff hash c300c7d66cc447297af165046255ca8f8f19e5105c24441c3cf377e0ad3a77b0, and git diff --check pass. Complete bun run check and the separate bun run test remain before rereview.

### Compatible-bucket remediation validation closure

The complete `bun run check` passed, followed by a separate complete `bun run test`. Each chain ran all four browser suites sequentially and headless: the 10,000-element human-performance board remained responsive, fixed-point returned 0 of 13 changed elements, both typed-text interactions round-tripped, and all 42 mixed-write live-session cycles converged. The on-demand command-contract check generated all three ignored views into two absent temporary directories, proved repeated byte identity, and left the checkout unchanged; the canonical authored audit JSON remains tracked. `git diff --check` passes. TASK-119 remains In Progress with every acceptance criterion unchecked for independent rereview.

Review remediation checkpoint 96baba6 (fix(inspection): bound compatibility preprocessing): replaced the profile-pair compatible-Set cache and all-profile event scan with exact-content profile snapshots, active bucket indexes, heavy-light ancestor path counts, subtree target summaries, expiry cleanup, and linear retained-state accounting. Runtime-mutable ReadonlySet inputs are snapshotted by current exact content; the module-root diagnostic proves exclude/include/exclude after mutation. Connector-node skips classification-blocked connectors instead of materializing all-leaf exclusions. Unpromoted boundary classification now uses the deterministic x sweep, and hierarchy selection retains only the current exact best parent per child.

Parent-approved schema-v1 amendment recorded in 5980cdf is implemented by one obstacleIdentity owner: exact UTF-16 sort; backslash -> double backslash; comma -> backslash-comma; literal comma join; obstacle: prefix. ObstacleRefSchema verifies id against elementIds. Direct and real package cases cover comma, backslash, combined backslash-comma, NUL, U+001F, lone surrogate, empty-looking prefixes, reversed input, and formerly colliding raw joins.

Focused evidence after two byte-stable fix passes (tracked diff SHA-256 8b5df30021cb08e67d07792e44f079e05e49fccac58ac1d943e3ebb014deee23): lint and formatting green; both TypeScript projects green; boundaries and module-scope green; 58 command proofs / 58 audited paths / 978 contract checks; 634 inspection checks; 579 CLI checks; geometry 89; labels 183; branch comparison green. Inspection matrices cover sparse insert-after-expiry at 1k/2k/4k/8k, shared-ancestor distinct conflicting profiles at 1k/2k/4k/8k with zero bucket scans/tests and exact linear profile/reference counts, dense same-set distinct profiles with complete unique enumeration, mutable Set reuse, sparse boundary-node preprocessing, and dense hierarchy one-best retained state. Public 1,516,200 and 2,000,001 comparison fixtures remain green.

Remaining before rereview: complete bun run check, separate complete bun run test, sequential headless browser evidence within each chain, final on-demand generation/determinism, git diff --check, task-state and clean-tree confirmation. TASK-119 remains In Progress with all acceptance criteria unchecked.

Final validation completed at 12309e5. Two consecutive real bun run fix passes produced the same tracked-diff SHA-256 (8b5df30021cb08e67d07792e44f079e05e49fccac58ac1d943e3ebb014deee23). Focused lint, formatting, both TypeScript projects, boundaries, module-scope, contracts (58 paths, 978 checks), inspection (634 checks), CLI (579 checks), geometry (89 checks), labels (183 checks), branch compare, and persisted/package cases passed. The first complete bun run check exposed one scheduling-sensitive human-performance sample; isolated diagnosis followed docs/agents/test-suite.md, and the required complete chain was rerun successfully. Final bun run check and the separate bun run test both passed, including all four browser suites sequentially and headlessly. On-demand contract generation into two independent temporary directories was byte-identical: cli-command-audit.md c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, command-contract-proof.json e6be922438f3d8dc9ce2a9bac33cfb68f5a5527492d9b7fbb7cd32d9441442c1, command-contract-proof.md def3540846fa0854944805a959f2671ba943ffeb0d55c8a47aaa3ab538d949c2. git diff --check passed; generated views remain absent and precisely ignored; only canonical docs/design/cli-command-audit.json is tracked. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

Union-query remediation checkpoint f95f488 replaces the partial-complement full-bucket fallback for hierarchy semantics with counted range indexes in both event and reciprocal orientations, intersects two-sided candidate results before bucket visitation, and counts candidate/set-membership work plus every remaining hierarchy predicate. Cross-set retained peaks now total both live indexes, and the diagnostics report includes query references and one total sweep-owned state count. Public and diagnostics matrices cover the reported nested-owner labels plus one unrelated node at 1k/2k/4k/8k in both orientations, exact arbitrary exclusions with control characters, same/cross sweeps, deterministic randomized brute-force pair and order differentials, and linear retained state. Obstacle refs now reject unsorted or duplicate elementIds/groupIds/library element IDs while preserving the accepted escaped identity bytes. Two bun run fix passes were byte-stable at 432a0ed0342b916a13d67e1f06f3aca6d27645ddd95e982e38967b97eb4200b6. Focused lint, types, boundaries, module-scope, contracts, inspection (646 checks), geometry, labels, branch, and CLI gates pass. Full bun run check, separate bun run test, final on-demand generation, diff, and clean-tree checks remain.

Final validation for the union-query closure passed. Two real bun run fix passes were byte-identical at tracked-diff SHA-256 432a0ed0342b916a13d67e1f06f3aca6d27645ddd95e982e38967b97eb4200b6. Complete bun run check passed, followed by a separate complete bun run test; each chain ran human-performance, fixed-point, typed-text, and live-session sequentially/headlessly. Focused evidence remained green: 58 contract paths/978 checks, inspection 646 checks, CLI 579 checks, geometry 89, labels 183, boundaries, module-scope, branch, and package cases. Two independent on-demand generation directories were byte-identical with hashes c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, e6be922438f3d8dc9ce2a9bac33cfb68f5a5527492d9b7fbb7cd32d9441442c1, and def3540846fa0854944805a959f2671ba943ffeb0d55c8a47aaa3ab538d949c2. git diff --check passed and the committed worktree was clean before this Backlog-only note. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

### Exact-exclusion and reciprocal-hierarchy closure checkpoint (2026-08-26)

Commit `7718f04` replaces the arbitrary exact-exclusion fallback with a stable structural segment index. Event-side and active-side exact exclusions are combined before bucket visitation; reciprocal hierarchy summaries represent the exact intersection of ancestor coverage, so a profile with one inside and one outside target remains excluded. `pairAllowed` is now an assertion over indexed compatibility. Query-state peaks are sampled before visitor early returns and post-insertion with zero query references; exact membership, hierarchy membership, index update/query, summary, and simultaneous retained-state work are separately counted only through the pure diagnostics entrypoint.

Obstacle refs now reject nonmember library attribution, kind/library contradictions, grouped singletons, and grouped refs without group evidence while retaining the approved escaped identity grammar. The public inspection matrix passes 653 checks, including 1k/2k/4k/8k compact arbitrary-exclusion and reciprocal multi-target cases in both orientations, early-return peak arithmetic, expiry/reinsertion, randomized pair/order differentials, and direct schema rejection. Focused lint, type-check, boundaries, module-scope, 58-path contracts (978 checks), inspection/package, geometry, labels, branch, and CLI (579 checks) pass. Two real `bun run fix` passes were byte-stable at diff SHA-256 `9ed8fd1c67e2a1739b71ee0ca1b20c2f8cd68f50d8dd2487bb04d4ece7648eb5`. Complete check, separate complete test, and final generator/state evidence remain.

### Exact-exclusion closure validation (2026-08-26)

Complete `bun run check` passed. The first separate `bun run test` reached the human-performance browser gate and observed one scheduling-sensitive acknowledgement sample with replacement count 2 after two zero samples; the immediately preceding complete check had passed with `[0,0]`. Following `docs/agents/test-suite.md`, the isolated human-performance suite passed with `[0,0]`, then the required complete `bun run test` rerun passed. Both successful complete chains ran all four browser suites sequentially and headlessly: the 10,000-element board remained responsive, fixed-point returned 0 of 13 changed elements, typed text preserved both rename interactions, and live-session converged through 42 of 42 mixed-write cycles.

Two fresh on-demand contract generations were byte-identical: `cli-command-audit.md` c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, `command-contract-proof.json` e6be922438f3d8dc9ce2a9bac33cfb68f5a5527492d9b7fbb7cd32d9441442c1, and `command-contract-proof.md` def3540846fa0854944805a959f2671ba943ffeb0d55c8a47aaa3ab538d949c2. Generated views remain absent/ignored; canonical `docs/design/cli-command-audit.json` remains tracked. `git diff --check` passed. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

### 2026-08-27 preprocessing-limit remediation

- Committed the parent-approved amendment separately at `aa87665`, including the reviewer source, fixed base/rejected head, unchanged protected scope, and the explicit `N = I + E + H` retained-memory definition.
- Implemented `BROAD_PHASE_PREPROCESSING_LIMIT = 25_000_000`, schema-v1 limits metadata, exhaustive text/schema support, and one closed `broad-phase-preprocessing-ceiling` finding. The attempted 25,000,001st unit is refused, the current and remaining model/pair passes stop, and whichever preprocessing/comparison ceiling is attempted first wins.
- Replaced the estimated model preflight with charges at primitive collection, map/set, identity-code-unit, stable-order, hierarchy, component, and sweep owners. Detailed work remains available only through the pure diagnostics root; product JSON/text carries no actual preprocessing count.
- Added alternating exact-exclusion evidence with the exact query/membership formulas, I+E+H many-exclusion and many-ancestor retained-state cases, 2,048 completion and 3,072 ceiling cases, package strict/non-strict/text/no-side-effect evidence, and preserved 1,516,200/2,000,001 comparison fixtures.
- Closed adjacent correctness: rotated plain decorations do not affect coverage; applicable rotated participants still do; obstacle refs require nonempty library source and group evidence for every multi-element component.
- Focused validation green before commit `81c9324`: type/lint; 671 inspection checks; boundaries/module-scope; 58 contract proofs and 978 contract checks; 579 CLI checks; geometry 89; labels 183; branch suite. Two `bun run fix` passes were byte-stable at diff SHA-256 `d015bade5a40fc4ec42846b9422666b0916532c752459eca89224f675c133686`. Full check/test chains remain to run after this checkpoint.

### 2026-08-27 preprocessing-limit final validation

Complete validation passed after source commit `81c9324` and evidence commit `c70e8a7`. The first `bun run check` observed the documented scheduling-sensitive human-performance reconciliation sample `[0,0,2]`; isolated diagnosis immediately passed at `[0,0]`, and the required full `bun run check` rerun passed. A separate complete `bun run test` then passed. Each successful full chain ran human-performance, fixed-point, typed-text, and live-session sequentially/headlessly: `[0,0]`, 0 of 13 changed elements, both text rename interactions preserved, and 42 of 42 mixed-write cycles converged.

On-demand contract generation was repeated with identical bytes, then all three ignored views were removed: audit Markdown `c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55`, proof JSON `4757efc048d711c45093a249a2b5c819e30ed043cf84eaa2e642f6a2c40ac5fa`, proof Markdown `70bcf2892140a4916b3ff51a5d51ec71a8b5b2e62dc884358bac70d2ace99bb7`. Canonical `docs/design/cli-command-audit.json` remains tracked. `git diff --check` passes. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

### Budget-preservation remediation checkpoint (2026-08-27)

- Commit `e9a4976` preserves caller-owned collision findings, completed broad-phase comparisons, and cumulative sweep diagnostics when the preprocessing ceiling aborts a later pass.
- Direct and real package coverage now exercises connector-intersection stops during `prepare-events` and `activate-or-expire` after an earlier connector-node penetration; the completed finding remains once, ordering and participant evidence remain deterministic, strict mode exits 8, non-strict exits 0, and no I/O side effect is introduced.
- The shared stable merge-sort owner now meters clone/allocation/cell initialization, source reads, comparisons, destination writes, and uneven tail copies before execution. Model, collision-pass, and interval-array construction meter source reads, allocation, membership, and writes at their primitive owners.
- Schema-v1 obstacle identity encoding is single-owned and meters each UTF-16 code unit read/emitted plus escaping and separators. A 6,300,000-code-unit library element identity reaches attempted preprocessing unit 25,000,001 in direct and parseable-note/package inspection instead of returning false-clean.
- Focused validation is green: type-check, lint including skill validation, boundaries, module-scope, 58-path contracts, inspection (689 checks), CLI, geometry, labels, and branch. Two `bun run fix` passes were byte-stable at `295966bd72297d21c439d94d7fbcf60d42a61c85b854f79a07fb20c47304d63d`. Full `bun run check`, separate `bun run test`, sequential browser chain, and final generated-view checks remain pending.

### 2026-08-27 budget-preservation final validation

Complete validation passed for source commit `e9a4976` and checkpoint note `e59292f`. `bun run check` passed. The first separate `bun run test` reached the documented scheduling-sensitive human-performance reconciliation sample `[0,0,2]`; a fresh isolated diagnosis passed at `[0,0]`, then the required complete `bun run test` rerun passed. The successful chains ran all four browser suites sequentially/headlessly: human performance `[0,0]`, fixed point 0 of 13 changed elements, both typed-text rename interactions preserved, and 42 of 42 live-session cycles converged.

On-demand CLI contract generation ran twice with identical bytes: audit Markdown `c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55`, proof JSON `4757efc048d711c45093a249a2b5c819e30ed043cf84eaa2b5c819e30ed043cf84eaa2e642f6a2c40ac5fa`, proof Markdown `70bcf2892140a4916b3ff51a5d51ec71a8b5b2e62dc884358bac70d2ace99bb7`.

Correction to the immediately preceding validation note: the proof JSON SHA-256 is `4757efc048d711c45093a249a2b5c819e30ed043cf84eaa2e642f6a2c40ac5fa`.

### Primitive metering remediation (2026-08-27)

- Checkpoint `a0a1697` centralizes budget-owned array, map, set, identity-code-unit, and stable-comparison operations behind immediate-charge primitives. Model construction, pass materialization, hierarchy/range work, and sweep lifecycle now use those owners.
- The exact compatibility tree stores one immutable logical summary cell per node. This makes cell accounting auditable, reduces retained references, completes the approved 2,048 alternating case, and stops the 3,072 case at attempted unit 25,000,001.
- Partial collision findings and cumulative diagnostics survive prepare-events and activate-or-expire stops. Direct and package fixtures pin the earlier connector-node penetration, one completed comparison, strict/non-strict behavior, and participant evidence.
- `test:inspection` now has 749 checks, including exact primitive arithmetic, 1,000,000 rejected group entries, the 4,999,891-code-unit boundary, long persisted identity, source-audit red fixtures, comparison-first precedence, and 1,516,200 completion.
- Focused lint, type, boundary, module-scope, 58-path contract, inspection, geometry, label, branch, and CLI gates passed. Two `bun run fix` passes produced identical diff hash `41a642400b3d73f7b53eb369fc25148db938e74414f7893b7094031781acbf8a`. Full check/test and final generator hygiene remain.

### 2026-08-27 primitive-metering final validation

Source commit `a0a1697` and evidence checkpoint `11446c5` completed the primitive-owner migration and structural audit. Complete `bun run check` passed. The first separate `bun run test` encountered the documented scheduling-sensitive human-performance sample `[0,0,2]`; two isolated probes reproduced it, the third isolated probe passed at `[0,0]`, and the mandatory complete `bun run test` rerun then passed. Both successful full chains ran all four browser suites sequentially/headlessly: human performance `[0,0]`, fixed point 0 of 13 changed elements, both typed-text rename interactions preserved, and 42 of 42 live-session cycles converged.

Two fresh on-demand contract generations were byte-identical: `cli-command-audit.md` c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, `command-contract-proof.json` 4757efc048d711c45093a249a2b5c819e30ed043cf84eaa2e642f6a2c40ac5fa, and `command-contract-proof.md` 70bcf2892140a4916b3ff51a5d51ec71a8b5b2e62dc884358bac70d2ace99bb7. The ignored views remain absent from the checkout and canonical `docs/design/cli-command-audit.json` remains tracked. `git diff --check` passed. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

Step 28 remediation checkpoint (2026-08-27)

- Committed 80af281 (`refactor(inspection): replace primitive metering`).
- Added the inert fixed-field input snapshot, closed unsafe-live-value and input-limit findings, 1,000,000 input-unit limit, 25,000,000 owner-level analysis-work limit, and unchanged 2,000,000 comparison limit.
- Removed the step-27 primitive wrappers, preprocessing constant/reason, regex source audit, exact VM-operation diagnostics, and retained-reference equations.
- Coarse diagnostics remain module-root development evidence only; product schemas and CLI bytes contain no work counters.
- Focused validation green: lint, type-check, boundaries, module-scope, geometry, labels, branch compare, 701 inspection checks, and 978 command-contract checks across all 58 paths.
- Two real `bun run fix` passes were byte-stable at diff SHA-256 b55b48405078055a3d479a8f9aa23508c778dcea284ca090ec616f012ef04eb3.
- Full `bun run check`, separate `bun run test`, sequential browser gates, and final generator/diff checks remain before rereview.

### 2026-08-27 step-28 final validation

Source checkpoint `80af281` and evidence checkpoint `945847e` complete the approved auditable-budget replacement. `bun run check` passed. The first separate `bun run test` reached the scheduling-sensitive human-performance reconciliation sample `[0,0,2]`; the required isolated diagnosis passed at `[0,0]`, and the complete `bun run test` rerun then passed. Both successful full chains ran the four browser suites sequentially and headlessly: human performance `[0,0]`, fixed point 0 of 13 changed elements, both typed-text rename interactions preserved, and 42 of 42 live-session cycles converged.

The focused matrix passed lint, type checking, boundaries, module scope, 701 inspection checks, 58 contract paths with 978 checks, CLI, geometry, labels, and branch comparison. Two real `bun run fix` passes were byte-stable at diff SHA-256 `b55b48405078055a3d479a8f9aa23508c778dcea284ca090ec616f012ef04eb3`. `git diff --check` passes.

Two fresh on-demand contract generations were byte-identical: `cli-command-audit.md` c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, `command-contract-proof.json` 26082fd0db9308d804475a3689da6730d8cd0c3af4f53d8b9282123e6b44688a, and `command-contract-proof.md` 053ea2da3ce9c063984141778b549a4913cce14d4b7a2474706ccf328d2cd8fd. The ignored views remain absent from the checkout; canonical `docs/design/cli-command-audit.json` remains tracked. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

2026-08-27 consolidated auditable-budget remediation checkpoint:
- Snapshot vocabulary now admits createdAt through the inert descriptor reader; direct and real package cases in both record orders match planLabelRepair oldest-createdAt keeper.
- Domain-work inventory now charges each active interval retention examination, every declared boundElements traversal, hierarchy/event/model/finding/ref stable ordering, path/segment traversal, and final coordinate/focus aggregation.
- Collision analysis carries an explicit comparison-terminal state. After comparison 2,000,001 wins, only non-budgeted deterministic report closure runs, so a later finalization workload cannot emit an analysis ceiling.
- The comparison-limit schema fixes limit=2,000,000, attempted=2,000,001, and the closed collision-pass vocabulary.
- Focused evidence: test:inspection 714/714, type-check, lint, boundaries, module-scope, contracts 58 paths/978 checks, geometry 89, labels 183, branch, and CLI 579 are green. Two fix passes were byte-stable at diff SHA-256 50ac7a5c55a98636f27cc84dd591dd397b990628d4a07e561c22503e791c3358. Full check/test validation remains pending.

Final validation for the 2026-08-27 consolidated remediation:
- bun run check passed the complete chain, including four sequential headless browser suites.
- The first separate bun run test reached the documented human-performance reconciliation flake at [0,0,2]; the isolated human-performance diagnosis immediately passed [0,0], and the required complete bun run test rerun then passed, including human performance [0,0], fixed point 0/13 changed, typed-text, and live session 42/42. No gate was waived.
- Two on-demand contract generations were byte-identical: cli-command-audit.md c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, command-contract-proof.json 2269f2c96ab9db9ccca5390a09f1187f78f66b82fd4c3d0a40d1c7142670a895, command-contract-proof.md c578b4ba5740e392df1451ba8ca5a268e968d4cd8a058839b272496f92780bcd. Derived views are absent/ignored; canonical docs/design/cli-command-audit.json remains tracked.
- git diff --check and clean-tree/task-state verification remain as final read-only checks. TASK-119 remains In Progress with all acceptance criteria unchecked.

### 2026-08-27 step-28 domain inventory closure

- Commit `1cfbba0` makes shared group qualification charge every supplied groupIds entry for invalid-identity role classification, unsupported applicable geometry, and obstacle construction. Direct diagnostics pin the 1-versus-1,000 delta at 999 for both classification paths; persisted package cases preserve the closed findings and strict exit 8.
- Shared label repair now uses exact indexed text membership instead of repeated textIds.includes scans. Inspection supplies one domain-level traversal observer for records, bound entries, membership candidates, label/drift graph entries, path points, findings, and boundTextDrift ordering. The 600-by-600 control completes below the analysis limit; the 6,000-by-6,000 direct and persisted boards stop deterministically at analysis attempt 25,000,001 with exactly one limit finding.
- The public inspection suite now contains an explicit eight-family step-28 owner inventory for records, groupIds, boundElements, paths/segments, label membership/drift, hierarchy/events/candidates, model aggregates, and refs/points/findings. It is scaling evidence, not a syntax or call-graph audit.
- Focused validation is green: type-check, lint, boundaries, module-scope, 58 contract paths/978 checks, inspection 730 checks, and labels 183 checks. Two real bun run fix passes were byte-stable at diff SHA-256 `ae1eae362f8a96e93efc6ebedc2914485a5542647e3d4476d52cc45371fc1d7a`. Complete check/test validation remains pending.

### 2026-08-27 domain inventory final validation

Source checkpoint `1cfbba0` and evidence checkpoint `ed44bf8` close the two remaining step-28 domain loops. Complete `bun run check` passed after the documented human-performance diagnosis sequence: two full attempts observed the scheduling-sensitive `[0,0,2]` sample, each isolated diagnosis passed `[0,0]`, and the required complete rerun passed. A separate complete `bun run test` then passed. The successful full chains ran all four browser suites sequentially and headlessly: human performance `[0,0]`, fixed point 0 of 13 changed elements, both typed-text interactions preserved, and live session 42 of 42 cycles converged. No gate was waived.

Two fresh on-demand contract generations were byte-identical: `cli-command-audit.md` c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, `command-contract-proof.json` 2269f2c96ab9db9ccca5390a09f1187f78f66b82fd4c3d0a40d1c7142670a895, and `command-contract-proof.md` c578b4ba5740e392df1451ba8ca5a268e968d4cd8a058839b272496f92780bcd. Generated views remain absent and ignored; canonical `docs/design/cli-command-audit.json` remains tracked. `git diff --check` passed. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

2026-08-27 final step-28 semantic inventory closure (checkpoint cd82ff7): replaced delimiter-composed bound-label pair identity with a nested exact-string Map/Set; direct and real persisted checks cover spaces, NUL/control characters, shared prefixes, and reversed record order. Closed the remaining named domain-pass claims for reverse-label ownership candidates, production node-hierarchy assignment, failed aggregate cleanup, obstacle attribution/group materialization, and finding finalization including point members. Extended the public diagnostic inventory with exact scaling deltas (label membership 22,995; reverse ownership 7,921; hierarchy 820; failed aggregate 5,165; obstacle attribution 1,209; point cardinality 22; crossing-point family 9). Manually reviewed every loop/materialization in the eight approved families—records; groupIds; boundElements; paths/segments; label membership/drift; hierarchy/events/candidates; model aggregates; refs/points/findings—and found no further scalable unclaimed domain pass. Focused evidence green: type-check, lint, boundaries, module scope, contracts (58 paths/978 checks), geometry (89), labels (183), branch, CLI (579), inspection (741), git diff check, and two byte-stable fix passes (diff SHA-256 dd018955440c88b52d5f4027c862e1b9e31422d82628338b04a2e6345b03f209). Full check/test validation remains pending.

2026-08-27 final semantic-inventory validation: source checkpoint cd82ff7 and evidence checkpoint 094093f passed complete bun run check and a separate complete bun run test without retries or waivers. Each chain ran all four browser suites sequentially/headlessly: human-performance reconciliation [0,0], fixed point 0 of 13 changed elements, both typed-text rename interactions preserved, and live-session convergence 42 of 42 cycles. Two on-demand contract generations were byte-identical: cli-command-audit.md c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, command-contract-proof.json 2269f2c96ab9db9ccca5390a09f1187f78f66b82fd4c3d0a40d1c7142670a895, command-contract-proof.md c578b4ba5740e392df1451ba8ca5a268e968d4cd8a058839b272496f92780bcd. The three views remain absent under docs/design/generated and precisely ignored; canonical docs/design/cli-command-audit.json remains tracked. git diff --check passes. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview.

Step 29 implementation (2026-08-27): committed 3a1c0ec after the separate approved-plan record 317622f. Removed the failed universal analysis-work guarantee and its schema, formatter, diagnostics, detector/model/sweep/label claim plumbing, tests, and documentation. Input accounting now belongs solely to the inert snapshot owner; public schema-v1 limits are exactly inputComplexityUnits=1,000,000 and broadPhaseComparisons=2,000,000. Preserved snapshot safety/fidelity, deterministic semantic algorithms, exact comparison counting, partial findings at the comparison stop, structural label-pair identity, createdAt label selection, hierarchy/obstacle/geometry fixes, and coarse development diagnostics. Focused evidence green: type-check, lint, boundaries, module-scope, contracts (58 proofs/58 audited paths/978 checks), inspection (722 checks), geometry (89), labels (183), branch, and CLI (34 commands/579 checks). Two on-demand generation runs were byte-identical, contained no removed schema token, left ignored views absent, and retained canonical docs/design/cli-command-audit.json. Two stable fix passes were proven before the final focused assertion; full validation remains to run. Residual risk is now explicit: the retained limits are capacity safeguards, not a general runtime/asymptotic/hang/DoS guarantee.

### 2026-08-27 step-29 final validation

Approved-plan commit `317622f`, source/docs/test checkpoint `3a1c0ec`, and focused evidence checkpoint `d42b5cd` complete the removal of the failed analysis-work guarantee. Two final `bun run fix` passes left the committed tree unchanged (empty-status SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Complete `bun run check` passed, followed by a separate complete `bun run test`; both chains ran all four browser suites sequentially/headlessly without retry or waiver: human-performance reconciliation `[0,0]`, fixed point 0 of 13 changed elements, both typed-text rename interactions preserved, and live-session convergence 42 of 42 cycles.

Focused retained evidence passed: inspection 722 checks, contracts 58 proofs/58 audited paths/978 checks, CLI 34 commands/579 checks, geometry 89, labels 183, boundaries, module scope, branch compare, input snapshot safety/boundaries, exact 1,516,200 comparison completion, attempt 2,000,001 stop, and preservation of an earlier finding exactly once. The comparison schema rejects wrong fixed values and unknown passes; schemas reject the removed limit key/reason.

Two fresh on-demand generations were byte-identical and excluded every removed token: `cli-command-audit.md` c586e0954f0a912d5e62bca0a30d46909dad2968a9b3bc639e2418f77901fe55, `command-contract-proof.json` 8b442bf53937bbccfa475213eb16a40ed6b07c0c1a4b72b441102d5e36bf0adc, and `command-contract-proof.md` 64e9849f609a4d00a64ef7c3cba41aa6044592ccbb20331e78cbdbd109c5a7e5. The ignored derived views remain absent; canonical `docs/design/cli-command-audit.json` remains tracked. All deleted analysis symbols are absent outside Backlog history, `git diff --check` passes, and the worktree was clean before this CLI-authored note. TASK-119 remains In Progress with all nine acceptance criteria unchecked for independent rereview. Residual risk is the approved step-29 truth: valid capped input can still induce superlinear semantic work, and external termination produces no report.

Final parent verification (2026-08-27): independent Standards and Spec rereviews both returned REVIEW_CLEAN for 963c3f0c5dadd3687a30d5133437e822427da582..022f1248c1b29e9075b065dae130f5c05fb14c19. Objective evidence: test:inspection 722; contracts 58 proofs/58 audited paths/978 checks; CLI 34 commands/24 subcommands/579 checks; labels 183; geometry 89; type, lint, boundaries, module-scope, branch, changes and one-write green; complete bun run check and separate bun run test green with all four browser suites sequential/headless. Generated views remained absent/ignored and deterministic; worktree was clean before finalization.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:21
---
Planning pass completed from current source inspection. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-25 23:47
---
Plan review incorporated the agreed inspection-only decode, vault-direct CLI, semantic-node versus obstacle distinction, and strict coverage contract. No implementation started.
---

author: @codex
created: 2026-08-25 23:59
---
CLI rewrite decision: this task now depends on TASK-123.01 and must add check through CommandContract, not the legacy raw-argv and printJson path.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: inspection remains a CLI-only CommandContract. Acceptance criteria and implementation steps contain no equivalent secondary agent transport.
---

author: @codex
created: 2026-08-26 12:19
---
Planning reopened after TASK-123.02 completed and was pushed at 7b7a4b38c3d06a1f660516b2f404f1672aa52ede. Existing plan must be re-audited against the post-migration source and independently approved before implementation.
---

author: @codex
created: 2026-08-26 13:02
---
Independent plan reviewer thread 01a03e0f-61d1-78d3-af62-04cefac7760e returned PLAN_APPROVED. Fixed implementation/review base: 963c3f0c5dadd3687a30d5133437e822427da582. All fourteen decisions are approved exactly as recorded. Implementation has not started. One serialized gpt-5.6-sol/medium worker is authorized next.
---

author: @codex
created: 2026-08-26 22:11
---
Parent approval recorded for plan step 27 before implementation. This amendment follows xhigh reviewer thread 01a03e0f-61d1-78d3-af62-04cefac7760e (PLAN_AMENDMENT_RECOMMENDED), fixed review base 963c3f0c5dadd3687a30d5133437e822427da582, and rejected head 688d27ce5cf01c1a38c70a22f1ff57c67b16c24a. It authorizes the separate deterministic 25,000,000 preprocessing ceiling and the explicit O(I + E + H) retained-memory contract. TASK-090 collision implementation, TASK-120 bridges, TASK-123.03 released reference work, server/UI/session/write paths, TASK-128, strict normal I/O, and generated-artifact ownership remain unchanged and protected.
---

author: @codex
created: 2026-08-27 01:48
---
Parent approval recorded for plan step 28 before source implementation. This replaces step 27 micro-metering after xhigh reviewer thread 01a03e0f-61d1-78d3-af62-04cefac7760e returned PLAN_AMENDMENT_RECOMMENDED against fixed base 963c3f0c5dadd3687a30d5133437e822427da582 and rejected head ff2a3bbb7516633606c6ec3e6e79d729f40fec87. The parent approved the inert input snapshot, 1,000,000 input-unit ceiling, 25,000,000 owner-level analysis budget, removal of primitive wrappers and regex auditing, and development-only semantic diagnostics. Contract compatibility, generated ownership, strict I/O, TASK-128, and all TASK-090, TASK-120, and TASK-123.03 protected scope remain unchanged.
---

author: Codex
created: 2026-08-27 05:13
---
Parent-routed final allowed step-28 inventory closure implemented at cd82ff7; TASK-119 intentionally remains In Progress with all acceptance criteria unchecked pending independent rereview.
---

author: Codex
created: 2026-08-27 05:39
---
Parent approval recorded for TASK-119 plan step 29 before source edits. The analysis-work guarantee is removed rather than patched or renamed. The input snapshot ceiling and semantic broad-phase comparison ceiling remain the only public capacity safeguards; protected scope and task completion state are unchanged.
---

author: codex
created: 2026-08-27 06:04
---
Step 29 source migration is implemented at 3a1c0ec. TASK-119 remains In Progress with all acceptance criteria unchecked pending full validation and independent rereview.
---

author: codex
created: 2026-08-27 06:16
---
Step 29 complete validation passed. TASK-119 remains intentionally In Progress with every acceptance criterion unchecked for fixed-base rereview.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented deterministic read-only board inspection and the vault-direct `archboard check --board <key>` command. The final schema-v1 contract truthfully bounds inert input capture at 1,000,000 units and eligible broad-phase comparisons at 2,000,000, preserves completed findings at comparison cutoff, and explicitly makes no universal runtime guarantee. Verified by 722 inspection checks, 58 command-contract proofs/978 assertions, 579 CLI checks, geometry/label/boundary/module/branch gates, complete `bun run check`, a separate complete `bun run test`, deterministic on-demand contract generation, and clean independent Standards and Spec fixed-range reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
