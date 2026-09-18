---
id: TASK-273
title: 'Act on the 2026-09-18 14:01 skill evaluation batch'
status: To Do
assignee: []
created_date: '2026-09-18 17:48'
labels: []
dependencies: []
priority: high
ordinal: 480000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Batch .skill-evals/2026-09-18T14-01-43-895Z (grader claude-opus-5) came back with every comparison but sequence-create withheld as 'not comparable', because 11 runs (2 baseline, 9 candidate) were set aside as contaminated. Analysis found three things to act on: the contamination is a false positive from Codex 0.155.0's skill-root aliases, the grader used the 'skill' axis to excuse a departure from a cited passage (S09 inspect.group), and the candidate SKILL.md grew from 18.6 KB to 32.4 KB with median author tokens +21%. Quality otherwise improved (ok 35->38, semantic failures 7->4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The three subtasks are Done
- [ ] #2 The user can re-run report on the 2026-09-18T14-01 batch and get assessed comparisons
<!-- AC:END -->
