---
id: TASK-148.08
title: Scale board-inspection limit tests without production-sized work
status: To Do
assignee: []
created_date: '2026-09-02 23:00'
labels: []
dependencies: []
references:
  - src/runtime/board-inspection/lib/detectors.ts
  - src/runtime/board-inspection/schemas.ts
  - comparison-limits.test.ts
  - package-limits.test.ts
parent_task_id: TASK-148
ordinal: 280000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers need the 2,000,000-comparison production ceiling preserved without spending about 41 seconds performing 2,000,001 comparisons four times. Make the detector ceiling injectable internally with a production default of 2,000,000; run behavioral matrices at a small representative ceiling near 2,000; keep one cheap assertion that pins the production default and shipped schemas.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Production behavior and public schemas still use exactly 2,000,000 unless an internal test seam explicitly supplies another ceiling.
- [ ] #2 Limit/exceeded/completed-findings behavior is covered once per distinct contract using a representative small ceiling, without duplicating the production-sized loop through module and package lanes.
- [ ] #3 The focused owners complete near one second on this host and report before/after elapsed time without weakening strict exit or schema behavior.
<!-- AC:END -->
