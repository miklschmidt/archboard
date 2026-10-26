---
id: TASK-548.09
title: A council of graders judges whether a changed drawing reads better or worse
status: To Do
assignee: []
created_date: '2026-10-26T16:24:00Z'
labels:
  - renderer
  - tooling
dependencies: []
parent_task_id: TASK-548
ordinal: 962000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner dropped byte-identical drawings as the bar for layout speed work. A change that alters drawings needs a judgment of whether each drawing reads better or worse to a person. The owner wants three graders (Opus, gpt-6.1-sol and gpt-6-astra), each forming its own criteria for a readable architecture diagram, not anchored on the old scorecard metrics (packages/renderer/tests/runtime/support/drawn-scorecard.ts and the drawn-* checks).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A command turns two corpus renders into blind pairs of PNG pictures for every drawing that differs, with the key to which side is which kept apart from the graders
- [ ] #2 Each grader writes its criteria before it sees a pair, and the criteria are recorded
- [ ] #3 A council run records each grader's verdict per pair (better, worse or same, with a reason) and the majority, and the procedure is written down in docs/design
<!-- AC:END -->
