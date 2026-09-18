---
id: TASK-273.03
title: Cut the archboard skill's always-read size back without losing what it teaches
status: To Do
assignee: []
created_date: '2026-09-18 17:49'
labels: []
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 483000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Between the frozen baseline and the candidate, skills/archboard/SKILL.md grew from 18.6 KB to 32.4 KB (+74%). In batch 2026-09-18T14-01-43-895Z median author tokens rose 21% (S06 +87%, S10 +58%, S04 +53%, S09 +53%) with output flat: the growth is cached input, the skill carried through every turn. About 6 KB of the file is table-alignment padding forced by the catalogue's long 'flow' row. SKILL.md is read by every run; references are read per workflow, so bytes moved from SKILL.md into the recipe that needs them are paid only by that workflow. Constraint (memory skill-examples-never-from-evals): nothing may be added, removed or reworded to suit one scenario; shared guidance stays portable CS terms, archboard names only inside a recipe's worked example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SKILL.md is materially smaller than 32.4 KB; the target and the measured result are recorded in the task
- [ ] #2 Every rule SKILL.md taught before is still taught, in SKILL.md or in the recipe of the workflow that needs it; a reviewer diff-checks this rule by rule
- [ ] #3 Every skill citation (<file>#<heading>) in evals/evals.json and rubric.md still resolves, updated where a heading moved
- [ ] #4 Derived skill copies are resynced and bun run check passes
<!-- AC:END -->
