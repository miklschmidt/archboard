---
id: TASK-273.02
title: A grader cannot excuse a departure from a passage the feature cites
status: To Do
assignee: []
created_date: '2026-09-18 17:49'
labels: []
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 482000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rubric's 'skill' axis says an expectation no passage of the skill teaches; it fails no run. In batch 2026-09-18T14-01-43-895Z, S09 candidate rep 3 (run-b98e641594) never used 'semantic inspect --group', which references/read.md teaches and the feature inspect.group cites in evals.json. The grader filed it on the skill axis with the gap 'the agent never opened read.md', and the run passed. Only a rubric sentence forbids this; nothing in code does. Every expected feature now carries skill citations (<file>#<heading>), so the code can tell when an 'untaught' claim names a passage the scenario already declares teaches it. User approved closing this mechanically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A skill-axis finding whose passage is one of its feature's declared citations counts as a conformance failure of that run, and fails its semantic compliance
- [ ] #2 The report lists each such reclassification with the run, the feature, the passage and the grader's stated gap, so the grader's contradiction is visible
- [ ] #3 A skill-axis finding naming a passage the feature does not cite is unchanged
- [ ] #4 The rule applies when a saved batch is re-reported, without re-grading
- [ ] #5 Behavioural tests own the rule
<!-- AC:END -->
