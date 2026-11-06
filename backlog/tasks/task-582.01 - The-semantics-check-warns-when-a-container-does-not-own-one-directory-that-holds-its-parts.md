---
id: TASK-582.01
title: >-
  The semantics check warns when a container does not own one directory that
  holds its parts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T15:13:00Z'
updated_date: '2026-11-06T15:14:00Z'
labels:
  - model
  - check
dependencies: []
parent_task_id: TASK-582
priority: high
ordinal: 1024000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent or user who reads the check needs a directed finding: which directory to bind, or which parts sit outside, and what judgement to make when the cause is the code layout and not the model. The owner asked for the judgement calls to be explained in the finding and in the consumer skill.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check warns on a container with bound parts and no binding, and names the directory to bind when one directory holds all its parts and no code of another module
- [ ] #2 archboard check warns on a container whose binding does not hold every bound part, and names the parts outside it
- [ ] #3 When no such directory exists, the warning says the parts are spread and names the judgement: move a part in the model when it belongs to another module, or move the code into one behavior folder and tell the user
- [ ] #4 A model that binds no code gets no such warning, and a container whose parts bind symbols in its own bound file is contained
- [ ] #5 The consumer skill tells an agent to bind each container to the directory that holds its parts, to read the warning before acting, and to tell the user when the code layout splits a behavior
- [ ] #6 Focused tests own each case through the machine-readable fields, not the wording
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a containment rule to the semantics structure check beside CONTAINER_PASS_THROUGH. 2. Direct its message: name the directory to bind, or the parts outside, and the judgement for spread parts. 3. Focused tests in structure.test.ts. 4. Consumer skill guidance in Give each container a job, plus CONTEXT and check docs that list the codes. 5. Measure on this repository.
<!-- SECTION:PLAN:END -->
