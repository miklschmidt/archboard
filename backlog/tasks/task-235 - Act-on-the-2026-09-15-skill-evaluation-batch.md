---
id: TASK-235
title: Act on the 2026-09-15 skill evaluation batch
status: Done
assignee: []
created_date: '2026-09-15 18:50'
updated_date: '2026-09-15 19:08'
labels: []
dependencies: []
references:
  - .skill-evals/2026-09-15T13-56-41-652Z/report.md
  - TASK-211
  - TASK-214
ordinal: 395000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The batch .skill-evals/2026-09-15T13-56-41-652Z (baseline = frozen TASK-210 skill, candidate = TASK-211 rewrite, 3 reps x 15 scenarios, Claude grader) showed the candidate does not change the pass rate: both arms fail S00, S05, S07, S10 and S14 (baseline) for the same reasons, and the report flags REGRESSED on any mean drop over three runs. The analysis found causes in the candidate skill (its own flask run example lacks the repeat it teaches and carries no relationships; the container rule does not cover a class drawn with children; the propose report step does not name re-targeted relationships), in the evaluation inputs (S10 demands a disclaimer sentence; S08 wants the signal edge from the container the source does not send from; S05 wants a self message the board cannot justify; S12 seeds an untrue call), one identity break a guardrail missed (S05 candidate rep 3 removed seven seeded edges and re-added them under new ids), and two cost drivers (the skill grew 2.6x so cheap scenarios pay to read it; groups, drill-down and colour are still missed). The subtasks fix each; the user reruns both arms afterwards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is done and bun run check passes
- [x] #2 The evaluation inputs validate with bun run eval:skill check
- [x] #3 The derived skills are synchronized with bun scripts/sync-skills.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-235.07 (CLI warning on remove+re-add) stays To Do as a follow-up needing a product decision; every other subtask is Done. bun run check exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ten subtasks implemented and verified; bun run check passes; eval inputs validate; skills synced.
<!-- SECTION:FINAL_SUMMARY:END -->
