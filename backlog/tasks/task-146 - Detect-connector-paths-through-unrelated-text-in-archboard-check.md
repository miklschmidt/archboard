---
id: TASK-146
title: Detect connector paths through unrelated text in archboard check
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-31 23:22'
updated_date: '2026-09-04 15:55'
labels:
  - needs-triage
dependencies: []
references:
  - TASK-119
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/schemas.ts
modified_files:
  - docs/agents/boundaries.md
  - docs/agents/test-suite.md
  - docs/design/cli-command-audit.json
  - docs/design/command-contract-design.md
  - src/cli/commands/check.ts
  - src/cli/finding-rendering/tests/finding-rendering.test.ts
  - src/runtime/board-inspection/index.ts
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/lib/format-text.ts
  - src/runtime/board-inspection/lib/geometry.ts
  - src/runtime/board-inspection/lib/model.ts
  - src/runtime/board-inspection/schemas.ts
  - src/runtime/board-inspection/tests/connector-text-penetration.test.ts
  - >-
    src/runtime/board-inspection/tests/fixtures/device-trust-text-penetration.json
  - src/runtime/board-inspection/tests/input-snapshot.test.ts
  - src/runtime/board-inspection/tests/schema-and-format.test.ts
  - tests/system/board-inspection/package-json.test.ts
priority: high
type: bug
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`archboard check --strict` can report `coverage: complete` and `clean: true` while supported arrow segments run through visible standalone text. The device-trust proposal boards exposed 11 such intersections per board. Examples included `cert-manager-to-gateway` through `cert-manager • 1 replica`, `customer-to-identity` through the enrollment description, and CA routes through CA and trust-state labels. `archboard check --strict --text --font-family 2` returned zero findings before those routes were repaired. A separate segment-to-text-bounds audit found the collisions.

This false clean result makes the documented board completion gate unreliable. Detect and report connector penetration of unrelated text. Keep routing repair manual.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For supported geometry, `inspectBoard` emits a deterministic error finding when a connector segment enters the interior of an unrelated live text element beyond the configured tolerance; the finding names the connector ID, text ID, segment index, intersection points, affected bounds, and focus bounds.
- [ ] #2 A board with such a finding has complete coverage, `clean: false`, and the strict CLI exits with the documented error status instead of reporting success.
- [ ] #3 The detector does not report a connector own bound label, text belonging to either bound endpoint, or boundary contact within tolerance solely because the connector reaches or labels its endpoint.
- [ ] #4 Regression coverage includes horizontal and vertical penetrations, negative relative connector points, nearby non-intersecting text, and tolerance-boundary controls.
- [ ] #5 The public finding schema, stable ordering, count summaries, text formatter, and focused finding rendering include the new defect without a generic details bag or an unversioned result change.
- [ ] #6 A fixture based on the observed device-trust route geometry fails against the current checker and passes once the defect is fixed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the closed inspection schema with a versioned connector-through-text error and deterministic ordering/count support.
2. Reuse the existing segment clipping and sweep primitives to compare supported connector segments with live text boxes, excluding the connector's own label and text belonging to either endpoint.
3. Add one focused board-inspection owner for geometry, tolerance, exemptions, observed device-trust geometry, schema, and formatting; extend the existing finding-rendering owner for the new finding.
4. Run only focused board-inspection, formatter/rendering, type, lint, format, and diff checks; commit a clean review range and report READY_FOR_REVIEW without finalizing acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented schema-v3 CONNECTOR_PENETRATES_TEXT/text-interior. The detector uses the existing bounded interval sweep and segmentInsideBox clipping with overlapTolerance, filters unsupported text geometry, and encodes own-label and endpoint-text exemptions as sweep compatibility so excluded pairs do not inflate the public comparison count. Added a three-record device-trust fixture plus focused geometry, tolerance, ordering/count, formatter, schema, and finding-render tests.

Focused validation: 58 tests across 11 board-inspection and finding-rendering owners passed; bunx tsc --noEmit passed; scoped oxlint and oxfmt checks passed; CLI contract artifacts generated successfully in /tmp; git diff --check and fixed-base ancestry passed. Broad/system/browser/repository-policy/capacity/performance suites were intentionally not run per assignment.
<!-- SECTION:NOTES:END -->
