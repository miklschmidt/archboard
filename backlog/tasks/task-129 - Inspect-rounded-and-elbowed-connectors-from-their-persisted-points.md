---
id: TASK-129
title: Inspect rounded and elbowed connectors from their persisted points
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 00:50'
updated_date: '2026-08-29 13:56'
labels:
  - ready-for-agent
dependencies:
  - TASK-130
references:
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/bridge.ts
  - src/runtime/board-inspection/lib/input-snapshot.ts
  - src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts
  - src/runtime/board-inspection/tests/bridge-create.test.ts
  - src/runtime/board-inspection/tests/bridge-validation.test.ts
  - tests/system/board-inspection/package-totality.test.ts
  - src/runtime/board-inspection/lib/decode.ts
modified_files:
  - src/runtime/board-inspection/lib/decode.ts
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/bridge.ts
  - src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts
  - src/runtime/board-inspection/tests/bridge-create.test.ts
  - src/runtime/board-inspection/tests/bridge-validation.test.ts
  - tests/system/board-inspection/package-totality.test.ts
priority: medium
type: bug
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board inspection currently classifies every connector carrying roundness, elbowed, or fixedSegments as unsupported. Normal architecture diagrams therefore become coverage-indeterminate and skip penetration, obstacle, crossing, and bridge analysis even though Excalidraw persists the routed connector as a point chain. Elbowed points form straight orthogonal segments. Rounded connectors can use the same sharp point chain for these semantic layout checks. Keep any exclusion narrow to a reachable stored state whose visible path cannot be recovered safely.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A valid elbowed connector participates in segment-based board inspection and does not emit UNSUPPORTED_GEOMETRY solely because elbowed is true.
- [ ] #2 A valid connector with fixedSegments participates in segment-based board inspection; fixed-segment editing metadata alone does not make coverage indeterminate.
- [ ] #3 A valid rounded connector is inspected from its persisted point chain without emitting UNSUPPORTED_GEOMETRY solely because roundness is present.
- [ ] #4 Reachable Excalidraw endpoint-special states use the visible segment chain when it can be recovered; any remaining unsupported finding is limited to the specific state that cannot be inspected safely.
- [ ] #5 Penetration, obstacle, unmarked-crossing, and bridge analysis exercise the same connector eligibility and produce findings for rounded and elbowed connectors.
- [ ] #6 Automated checks demonstrate that the old blanket exclusion fails and that clean rounded or elbowed boards retain complete coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
BASE: ce6b1a2c0398fbfe021bd69863acb5c88826a9ff

## Change acceptance and diagnosis

- Affected workflow and value: a person or agent runs board inspection or creates/reads a bridge on an ordinary Excalidraw architecture board containing rounded or elbow-routed connectors. The observable improvement is complete coverage plus the same penetration, obstacle, crossing, and bridge results already produced for sharp point-chain connectors, except for the one pinned renderer state whose path is not drawn.
- Real need and reachable states: current `inspectBoard` probes return `coverage: "indeterminate"`, emit `UNSUPPORTED_GEOMETRY/rounded-or-elbowed`, and suppress real node penetration for every rounded/elbowed connector. `planBridgeCreate` independently refuses the same sources. Canonical fixtures produced once by the existing ingress converter (`expandElements(..., { deterministic: true, forStore: true })`) and accepted by strict persisted validation prove the non-elbow rounded and correlated elbow/fixed/special families are stored product states.
- Pinned renderer boundary: Excalidraw 0.18.1's `isElbowArrow` is true for an arrow with truthy `elbowed`; `scene/Shape.ts` refuses to render that elbow when any relative point coordinate has `abs(coordinate) > 1_000_000`. Exactly `±1_000_000` renders; `±1_000_001` does not. Inspection and bridge planning must share this exact local-coordinate rule.
- Root cause: `connectorGeometryFindings` withholds decoded segments for every non-null roundness, truthy/non-false elbowed value, or non-null fixedSegments value. `bridge.ts` repeats the same broad gate and labels all accepted sources “straight.” The existing `decodePath` already recovers the finite stored chain, but does not expose the pinned elbow eligibility boundary.
- Smallest resulting product: add one named, board-inspection-local eligibility function beside `decodePath`, call it from both detector and bridge paths, and delete both duplicated broad predicates. This new seam deletes duplicated mode decisions and owns the one renderer-derived limit; it is not a generic geometry/routing abstraction. Add no converter, outbound conversion, second board representation, or inspection mode.

## Persisted semantic-chain contract

- Preserve TASK-134's vendor-derived correlated union unchanged: ordinary arrows remain `elbowed: false` with ordinary point bindings and no elbow-only field bag; elbow arrows remain `elbowed: true` with `FixedPointBinding | null`, `readonly FixedSegment[] | null`, and `startIsSpecial/endIsSpecial: boolean | null`. Do not add handwritten replacement types, broad source casts, an optional subtype bag, a pin change, or converter work.
- In `src/runtime/board-inspection/lib/decode.ts`, add a named `persistedConnectorPointChainEligibility` result/predicate used by both consumers after `decodePath`. It returns eligible or one precise exclusion with load-bearing evidence. Its ordered rules are:
  1. If `record.type === "arrow"` and `Boolean(raw.elbowed)`, every decoded **relative** point x and y must satisfy `Math.abs(value) <= 1_000_000`. The first violating point produces `elbow-coordinate-limit` evidence: point index, axis, coordinate, and limit. The test origin is deliberately nonzero so a mutation that checks scene coordinates fails.
  2. A raw `elbowed` value other than `undefined | null | false | true` remains narrowly excluded as `malformed-elbowed`; this preserves totality for the existing `elbowed: "bad"` note state. The pinned coordinate check runs first for any truthy arrow value, matching `isElbowArrow`.
  3. Non-null `fixedSegments` remains narrowly excluded unless the same record is an arrow with `elbowed === true`; this preserves the existing wrong-union-arm package state while accepting vendor-valid elbow fixed-segment metadata.
  4. `roundness`, valid `elbowed: true`, valid elbow `fixedSegments`, and endpoint-special values never exclude an otherwise recoverable chain.
- A stored line/arrow contributes semantic segments when it is live, has one usable id, has angle absent/zero, has no explicit `curve` or `curveKind`, `decodePath` recovers at least two finite relative points into finite scene points, and the shared eligibility result accepts it. Each analyzed segment is deliberately the sharp approximation `scenePoints[i] -> scenePoints[i + 1]`.
- This is a semantic-layout approximation, not pixel collision. Rounded linear curves and elbow quadratic corners can depart from their sharp control-point chain near corners, so checks near a bend can produce both false positives (the sharp corner/leg intersects where the rendered curve cuts away) and false negatives (the rendered curve bows into space the sharp segments do not occupy). Explicit curve/curveKind modes remain unsupported. The value is deterministic architecture-layout checking using the canonical stored chain, with this corner risk documented rather than hidden.
- In the pinned release, `startIsSpecial` and `endIsSpecial` affect subsequent elbow rerouting; rendering still consumes the complete stored points array. Cover the full `{true,false,null} × {true,false,null}` cross-product without transforming points, plus independent first-segment and last-segment interactions. Do not call this chain “visible geometry,” add endpoint flag snapshot conversion, drop points, or synthesize replacements.
- Existing operation-specific safety remains: inspection reports zero-length ambiguity and analyzes other nonzero segments; bridge creation requires a usable all-nonzero source and an exact proper crossing.

## TDD implementation plan

1. **Natural detector red at the public module seam.** In `src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts`, replace only obsolete blanket-exclusion/suppression rows while preserving narrow raw-totality coverage:
   - canonical rounded ordinary arrows and correlated elbow arrows with valid fixedSegments must have complete coverage and no mode-only unsupported finding;
   - a compact nine-row endpoint-special cross-product must keep the same full stored semantic segments;
   - dedicated start-special and end-special scenes place node/obstacle/crossing interactions on the first and last stored segments and assert the exact segment indices;
   - rounded and valid elbow/fixed candidates each produce `CONNECTOR_PENETRATES_NODE`, `CONNECTOR_PENETRATES_OBSTACLE`, and `CONNECTOR_INTERSECTION_UNMARKED`;
   - elbow coordinates `+1_000_000` and `-1_000_000` with a nonzero origin are accepted, while `+1_000_001` and `-1_000_001` emit only the narrow `UNSUPPORTED_GEOMETRY/rounded-or-elbowed` limit refusal and suppress their segments; a non-elbow control above the elbow ceiling remains eligible;
   - retain `elbowed: "bad"` and fixedSegments on the wrong union arm as narrow unsupported cases.
   First run must be naturally red under the current broad exclusion.

2. **Shared eligibility and minimal detector green.**
   - In `src/runtime/board-inspection/lib/decode.ts`, define the single `1_000_000` constant and `persistedConnectorPointChainEligibility` contract above. The coordinate comparison is over decoded relative points, applies only to arrow + truthy elbowed, and returns the first offending point/axis deterministically.
   - In `src/runtime/board-inspection/lib/detectors.ts`, replace `unsupportedRounded` with that result. Valid rounded/elbowed/fixed/special states flow to the existing segment builder. For the coordinate ceiling, retain `UNSUPPORTED_GEOMETRY/rounded-or-elbowed`; emit a limit-specific message naming point index, axis, value, and `±1,000,000`, while the existing finding `points` and `affected` bbox provide geometric evidence. Use the same closed details shape and public reason/schema. Give malformed-elbowed and wrong-arm fixedSegments equally narrow issue-specific messages under the same compatible reason.
   - Leave path decoding, segment numbering, zero-length ambiguity, rotation/curve findings, measurements, bindings, and downstream detectors unchanged.

3. **Bridge red/green and observable correlation.**
   - In `src/runtime/board-inspection/tests/bridge-create.test.ts`, add canonical rounded/elbow/fixed sources, the endpoint-special cross-product where compact, and exact elbow boundary cases. Assert `±1_000_000` is accepted and `±1_000_001` is refused. For an ineligible source, assert the public `BridgeRefusal.message` equals exactly `Both sources must be live arrow/line connectors at zero rotation, without explicit curve fields, with finite non-zero point-chain segments; elbow coordinates must stay within ±1,000,000.`. Retain malformed-elbowed and wrong-arm fixedSegments refusal coverage.
   - Before creating a decoration, inspect each eligible crossing and capture its sole `CONNECTOR_INTERSECTION_UNMARKED` finding. Compare `planBridgeCreate.overSegmentIndex`, `underSegmentIndex`, and `crossing` to the finding's connector-id-correlated segment indices and point; do not rely on first/second ordering.
   - In `src/runtime/board-inspection/tests/bridge-validation.test.ts`, apply that exact plan through the existing element-input boundary, assert `validateBridgeDecorations` returns one valid/no invalid bridge and suppresses that marked crossing, then add a second crossing and assert exactly that unrelated crossing remains unmarked.
   - In `src/runtime/board-inspection/bridge.ts`, call the same eligibility result after `decodePath`; remove the broad roundness/elbowed/fixedSegments clauses and delete the now-unused `absentOrFalse`. Keep type/live/id/angle/curve/path/zero-segment and exact-crossing requirements. Update the stale refusal to exactly `Both sources must be live arrow/line connectors at zero rotation, without explicit curve fields, with finite non-zero point-chain segments; elbow coordinates must stay within ±1,000,000.`.

4. **Persisted package red/readback without losing totality.** In `tests/system/board-inspection/package-totality.test.ts`, replace the valid-mode portions of the old suppression table, but retain raw `elbowed: "bad"` and wrong-arm `fixedSegments` rows as exit-8 narrow refusals. Produce valid rounded and correlated elbow/fixed/endpoint-special fixtures once through existing `expandElements`, persist them through the isolated package owner, and exercise the shipped `archboard check --board <key> --strict` boundary:
   - clean valid rounded and elbow boards: exit 0, `coverage: "complete"`, `clean: true`, no mode-only unsupported finding;
   - complete collision boards: exit 7, complete coverage, and candidate-attributed node penetration, obstacle penetration, and unmarked crossing;
   - a clean elbow boundary board at relative coordinate exactly `1_000_000`: exit 0 with complete coverage and no unsupported finding; the matching `1_000_001` board: exit 8, indeterminate, limit-specific unsupported message/evidence, and no candidate collision findings;
   - malformed-elbowed and wrong-arm fixedSegments raw rows: exit 8 and retain their narrow unsupported/suppression assertions.
   Do not add a package owner, change CLI/report schemas, or weaken package totality.

5. **Load-bearing mutations.** Apply and revert one mutation at a time, recording the failing owner:
   - change `<= 1_000_000` to `< 1_000_000`: accepted-boundary rows fail;
   - change the rejection boundary to admit `1_000_001`: refused module/bridge/package rows fail;
   - check absolute scene points instead of relative points: nonzero-origin boundary rows fail;
   - bypass the shared result in bridge: over-limit bridge refusal fails;
   - reinstate any broad roundness, valid-elbowed, or valid-fixedSegments gate: positive module/package/bridge rows fail;
   - remove malformed-elbowed or wrong-arm fixedSegments exclusions: preserved totality rows fail;
   - drop a first/last stored endpoint segment: endpoint interaction/index and crossing-plan correlation fail.
   Restore the intended implementation after every mutation and rerun its owner.

## Exact scope, caps, and protected areas

Production owners:
- `src/runtime/board-inspection/lib/decode.ts`
- `src/runtime/board-inspection/lib/detectors.ts`
- `src/runtime/board-inspection/bridge.ts`

Test owners:
- `src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts`
- `src/runtime/board-inspection/tests/bridge-create.test.ts`
- `src/runtime/board-inspection/tests/bridge-validation.test.ts`
- `tests/system/board-inspection/package-totality.test.ts`

Keep each edited test below the repository's 500-physical-line cap, targeting at most 475 by replacing obsolete tables with compact matrices instead of appending parallel suites. Add no lint/type/test waiver.

Protected: `src/shared/board-elements/**` and TASK-134's correlated types; engine converters, `applyElementInput`, persisted validators, and write paths; `lib/input-snapshot.ts`; report reason/details schemas and formatter vocabulary; bridge metadata and generated-line contract; frontend/browser owners; package.json, bun.lock, tsconfig, lint/format config, test inventory, ADRs, and docs. No dependency, manifest, browser/UI, frontend-build, conversion, or documentation change.

## Validation and cleanup order

1. Capture natural reds in order:
   - `bun test src/runtime/board-inspection/tests/unrepresentable-geometry.test.ts`
   - `bun test src/runtime/board-inspection/tests/bridge-create.test.ts src/runtime/board-inspection/tests/bridge-validation.test.ts`
   - `bun test tests/system/board-inspection/package-totality.test.ts`
2. After each smallest green, rerun its focused owner; then execute and revert all mutations above and rerun all focused owners together.
3. Run `bun run type-check`, `bun run lint`, and `bun run fmt:check`.
4. Run `bun run test:modules`, `bun run test:system`, and `bun run test:repository`.
5. Run `bun run check`, including the unchanged serial-browser lane required by the repository. No browser test/source edit or manual rendered workflow is warranted because the public verification surfaces are inspection reports, bridge plans, and the shipped check command.
6. Confirm package owners dispose isolated vaults in `finally`; remove no user data. Revert every deliberate mutation, remove probes/logging, run `git diff --check`, inspect `git status --short`, and verify no generated, dependency, frontend, or unrelated file changed.

Implementation remains paused for rereview. Acceptance criteria remain unchecked and finalSummary remains null.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planning diagnosis and review amendment at fixed BASE ce6b1a2c0398fbfe021bd69863acb5c88826a9ff:

- Repeated public probes show the existing blanket rounded/elbowed exclusion makes coverage indeterminate and suppresses real connector findings; bridge planning repeats the refusal.
- Existing expandElements plus strict persisted validation accepts canonical rounded ordinary arrows and correlated elbow/fixed/endpoint-special arrows, proving valid product reachability.
- Review of pinned Excalidraw 0.18.1 establishes the exact remaining renderer limit: isElbowArrow uses arrow + truthy elbowed, and Shape.ts renders no path if any relative point coordinate has absolute value above 1,000,000. The revised plan shares this eligibility decision between inspection and bridge.
- The semantic detector deliberately analyzes the sharp persisted point chain for rounded/elbowed connectors. That is not pixel geometry and carries documented false-positive/false-negative risk around curved corners.
- Endpoint-special true/false/null values affect rerouting, while the pinned renderer consumes the complete stored points array. The revised tests cover the nine-state cross-product plus first/last stored interactions.
- Raw malformed elbowed and wrong-union-arm fixedSegments cases remain narrow totality refusals; valid mode rows become positive.
- No implementation, source, test, package, documentation, dependency, or generated artifact was changed during planning.

Implementation: added one board-inspection-local persisted connector point-chain eligibility seam. Rounded, valid elbowed/fixed-segment, and all endpoint-special combinations now use decoded relative point chains; malformed elbowed, wrong-arm fixedSegments, and elbow coordinates beyond ±1,000,000 remain narrow refusals with issue-specific evidence.

Bridge: bridge planning now reuses the same eligibility seam and correlates exact crossing point and segment indices through inspection findings. The public refusal names live connector, rotation, curve, finite non-zero chain, and elbow-coordinate requirements.

Verification: focused owners pass independently (7/118, 4/43, 5/547, and 3/88); board-inspection system lane 19/207; modules 377/2,999; system 248/4,011; repository 61/218; full check including serial browser lane passed. Planned mutations each produced targeted reds and were reverted; test owners remain below 500 lines (474/243/224/403).
<!-- SECTION:NOTES:END -->
