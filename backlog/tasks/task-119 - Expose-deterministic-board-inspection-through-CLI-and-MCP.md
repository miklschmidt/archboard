---
id: TASK-119
title: Expose deterministic board inspection through the CLI
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 17:17'
updated_date: '2026-08-26 13:05'
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
- [ ] #1 A pure inspectBoard(elements, policy?)-style module returns a deterministic report without browser, filesystem, canvas, or mutation dependencies.
- [ ] #2 archboard check --board <key> is declared through CommandContract, reads the named persisted board directly, works without a running canvas server or browser, emits its schema-validated result plus an optional concise text mode, and performs no board write, claim, open, save, repair, or rewrite.
- [ ] #3 The command contract declares inspection inputs, stable result schema, prerequisites, read-only effect, text mode, strict refusal and exit semantics, examples, and all metadata required by generated help and the TASK-123.03 result reference.
- [ ] #4 A narrowly scoped inspection decode reports invalid render geometry, stale linear dimensions, broken bindings or references, bound-label corruption, configured font-policy violations, and unsupported geometry without weakening validation on normal reads or any write.
- [ ] #5 Layout findings cover unrelated leaf-node penetration, unmarked connector intersections, node overlap, and label overlap with stable element IDs, node IDs, coordinates, and bounding boxes.
- [ ] #6 Containment-aware modeling aggregates semantic nodes only from elements sharing customData.archboard.node, models grouped unpromoted stencil geometry separately as visual obstacles when needed, preserves groups containing several promoted nodes, excludes endpoint nodes and containing zones, and does not report a connector merely for crossing a container boundary.
- [ ] #7 Reports state whether coverage is complete or indeterminate. Strict mode has documented deterministic exit semantics by severity and never reports clean when a case was skipped, unsupported, or indeterminate.
- [ ] #8 Public-interface regression fixtures include a dense, human-grouped architecture board where semantic compare is clean and a locally improved route creates a second crossing elsewhere; a whole-board recheck catches the regression.
- [ ] #9 Tests cover negative relative points, stale dimensions, endpoint and zone exclusions, promoted multi-element nodes, grouped unpromoted stencil obstacles, groups containing multiple promoted nodes, tolerance boundaries, unsupported curves or rotation, stable report ordering, contract validation, and clean stdout and stderr separation.
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint 1: extracted the shared architecture-facts entrypoint and adapted compare without changing its semantic model. bun run type-check, bun run test:branch, and git diff --check passed; branch coverage retained promoted stencil nodes, promoted connectors, warnings, node order, and edge facts.
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
<!-- COMMENTS:END -->
