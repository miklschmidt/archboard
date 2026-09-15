---
id: TASK-235.05
title: Let edge-between accept a sender inside the named container
status: Done
assignee: []
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/outcomes-board.ts
  - src/runtime/skill-evaluation/lib/suite.ts
  - evals/evals.json
parent_task_id: TASK-235
ordinal: 400000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S08 outcome checks failed in 1/3 baseline and 2/3 candidate runs because the harness check edge-between wants the signal edge from Flask app to Metrics extension, while the authors routed it from full_dispatch_request and finalize_request inside a Flask app container, which the grader confirmed is what app.py 864 and 892 do and what the skill teaches (a call comes from the function whose body makes it). The check contradicts the skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 edge-between takes an optional flag under which from and to match the named node or any node contained in it, transitively
- [x] #2 S08 uses it so a signal sent from a method inside Flask app passes and an edge from an unrelated node still fails
- [x] #3 A focused harness test covers the contained match and the non-match
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
edge-between takes includeContained; S08 uses it. Test in src/runtime/skill-evaluation/tests/outcomes.test.ts covers the contained match, a kind mismatch and a non-contained sender. bun test src/runtime/skill-evaluation: 115 pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
edge-between matches a sender or receiver drawn inside the named part when asked; S08 passes a signal from a method inside Flask app; verified by the outcome tests.
<!-- SECTION:FINAL_SUMMARY:END -->
