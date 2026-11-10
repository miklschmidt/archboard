---
id: TASK-622
title: >-
  The footprint says which changed modules hold another, and the Action judges
  them as the gate does
status: To Do
assignee: []
created_date: '2026-11-10T01:07:00Z'
labels:
  - footprint
  - actions
dependencies: []
priority: medium
ordinal: 1068000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pull-request Action lists a module bound to a directory as changed outside the plan whenever a module inside it changed, while `model footprint --fail-outside` lets that module pass. On PR #89 the Action showed 8 such modules. The rule lived only in the CLI, and the Action runs without the CLI's packages, so it could not share it. The footprint answer now says, for each changed part, which other changed parts its binding holds, and both the gate and the Action read that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each changed part of a footprint lists the ids of the other changed parts that its binding holds, as `holds`; an unchanged part lists none
- [ ] #2 `model footprint --fail-outside` fails only on a changed module outside the draft whose `holds` is empty, and the CLI rule file is gone
- [ ] #3 The pull-request Action leaves a changed module that holds another changed module out of 'Changed outside the plan', and an answer without `holds` keeps the old behavior
- [ ] #4 The CLI summary line counts 'changed outside the plan' the way the gate does
- [ ] #5 Docs, skills and the vault say the Action applies the same rule
<!-- AC:END -->
