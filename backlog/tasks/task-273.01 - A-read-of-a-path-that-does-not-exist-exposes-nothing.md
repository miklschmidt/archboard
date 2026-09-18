---
id: TASK-273.01
title: A read of a path that does not exist exposes nothing
status: To Do
assignee: []
created_date: '2026-09-18 17:49'
labels:
  - bug
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 481000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex 0.155.0 lists an installed skill as r0/archboard/SKILL.md with a table mapping r0 to its root. In all 11 runs set aside as contaminated in batch 2026-09-18T14-01-43-895Z, the author's first command mis-expanded the alias to <batch>/world/home/.agents/skills/archboard/SKILL.md (dropping runs/<arm>/<S>/<rep>/), sed exited 2 'No such file or directory', and the author then read the correct path. reachesBatchOutsideWorld in src/runtime/skill-evaluation/lib/classify.ts matches text only, so a read of nothing counted as reading another run. Exposure is decided once at run time (author.ts) and stored in run.json, so a fix to the classifier alone cannot recover the saved batch, whose 90 runs are all graded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A command naming a literal batch path that exists nowhere on disk is not counted as other-run exposure; a path that exists, a glob, or a listing of the batch root still is
- [ ] #2 The report re-audits exposure from each run's stored commands.json with the current classifier rather than trusting the count recorded at run time, so a classifier fix reaches saved batches
- [ ] #3 Re-running report on .skill-evals/2026-09-18T14-01-43-895Z sets none of those 11 runs aside, without re-grading and without the batch being refused by its input digest
- [ ] #4 Behavioural tests own both rules
<!-- AC:END -->
