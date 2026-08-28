---
id: TASK-129
title: Inspect rounded and elbowed connectors from their persisted points
status: To Do
assignee: []
created_date: '2026-08-28 00:50'
updated_date: '2026-08-28 01:03'
labels:
  - ready-for-agent
dependencies:
  - TASK-130
references:
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/bridge.ts
  - src/runtime/board-inspection/lib/input-snapshot.ts
  - scripts/check-board-inspection.mjs
modified_files:
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/bridge.ts
  - src/runtime/board-inspection/lib/input-snapshot.ts
  - scripts/check-board-inspection.mjs
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
