---
id: TASK-243
title: Act on the 2026-09-16 skill evaluation batch
status: Done
assignee: []
created_date: '2026-09-16 02:25'
updated_date: '2026-09-16 02:36'
labels: []
dependencies: []
references:
  - .skill-evals/2026-09-16T00-32-53-542Z/report.md
  - TASK-235
  - TASK-211
ordinal: 414000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The batch .skill-evals/2026-09-16T00-32-53-542Z (baseline = frozen TASK-210 skill, candidate = TASK-211 rewrite after TASK-235, 3 reps x 15 scenarios, Claude grader) showed the candidate ahead on outcomes: 40/45 runs fully ok against 31/45, S07, S11 and S14 fixed outright, mean correctness 8.7 against 8.2, at 15% more author tokens. The user decided to promote the candidate to the new baseline and act on what the analysis found: S05 still fails 0/3 in both arms (authors split the request context into method participants so no self message exists, beats name nodes and never the push step, `as` handles are declared but unused, and the renderer ellipsizes the participant name `RequestContext.match_request`); every candidate S00 run read the sequence recipe instead of the architecture recipe because the prompt says how a request travels; seven candidate runs stamped default traffic on teardown, error and startup edges; S14 candidate runs declared views and flows not applicable on twenty-part boards whose full render is a 4000 px tangle; the read and small-edit routes pay to read the 15k-character authoring reference. Subtasks fix each; the user reruns both arms afterwards. Harness findings not in scope here: the REGRESSED verdict fires on any mean drop over three runs, and `semantic edit` refuses `--variant` while inspect, render, rasterize and adopt accept it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every subtask is done and bun run check passes
- [x] #2 The evaluation inputs validate with bun run eval:skill check
- [x] #3 The derived skills are synchronized with bun scripts/sync-skills.ts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All six subtasks Done. bun run check exit 0 (module 3128, system 163, repository 8, browser lanes pass); bun run eval:skill check: suite ok; bun scripts/sync-skills.ts synced. Follow-ups filed but not started: TASK-244 (REGRESSED tolerance) and TASK-208.02 (--variant on semantic edit). Nothing committed; the working tree holds the changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Promoted the candidate to the frozen baseline and acted on the 2026-09-16 batch's findings in the skill, the sequence renderer and the eval inputs; verified by bun run check, eval:skill check and the skill sync.
<!-- SECTION:FINAL_SUMMARY:END -->
