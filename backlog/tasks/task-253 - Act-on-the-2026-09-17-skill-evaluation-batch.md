---
id: TASK-253
title: Act on the 2026-09-17 skill evaluation batch
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:19'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
references:
  - .skill-evals/2026-09-17T11-04-59-127Z/report.md
  - TASK-243
ordinal: 440000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The batch .skill-evals/2026-09-17T11-04-59-127Z (baseline = frozen TASK-211 skill, candidate = the TASK-243 changes, 3 reps x 15 scenarios, Claude grader) showed the TASK-243 changes working: traffic on teardown/pop/startup went from 5 flagged runs to 0, every candidate S00 run now reads the architecture recipe, and the S05 self message is right 3/3. Three rules overreach or fall short: all candidate S00 runs and one S14 run leave traffic off the dispatch and view calls as "a branch"; one S05 run folded a participant the prompt named into a self call on its caller; the beat still names the step but not the part that relies on the ordering (2/3 fail). The user decided to fix these and four harness/product findings, then rerun both arms: S14 views are never captured so the view rule cannot improve readability; a restatement without an id whose original is removed in a later write evades the RELATIONSHIP_REPLACED warning (S05 candidate r3 broke ids-stable that way); the guidance column counts a recipe the baseline package does not ship (S09 baseline 0/3); a self step note is not drawn in the data-flow capture (5 of 6 S07 runs).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is done and bun run check passes
- [x] #2 The evaluation inputs validate with bun run eval:skill check
- [x] #3 The derived skills are synchronized with bun scripts/sync-skills.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All seven subtasks Done. bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes); bun run eval:skill check suite ok; bun scripts/sync-skills.ts synced. Nothing committed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Acted on the 2026-09-17 batch: traffic, self-participant and beat guidance in the skill; an every-view capture for S14; a warning for a restatement across two writes; guidance counted against the arm's own package; step notes drawn in data-flow pictures. Verified by bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes), eval:skill check and the skill sync. The skill-text changes need the next evaluation batch to show their effect.
<!-- SECTION:FINAL_SUMMARY:END -->
