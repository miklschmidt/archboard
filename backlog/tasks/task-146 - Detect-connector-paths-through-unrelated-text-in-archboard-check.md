---
id: TASK-146
title: Detect connector paths through unrelated text in archboard check
status: To Do
assignee: []
created_date: '2026-08-31 23:22'
labels:
  - needs-triage
dependencies: []
references:
  - TASK-119
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/schemas.ts
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
