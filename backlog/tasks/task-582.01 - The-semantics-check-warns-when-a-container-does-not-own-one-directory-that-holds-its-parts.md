---
id: TASK-582.01
title: >-
  The semantics check warns when a container does not own one directory that
  holds its parts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T15:13:00Z'
updated_date: '2026-11-06T15:55:00Z'
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
- [x] #1 archboard check warns on a container with bound parts and no binding, and names the directory to bind when one directory holds all its parts and no code of another module
- [x] #2 archboard check warns on a container whose binding does not hold every bound part, and names the parts outside it
- [x] #3 When no such directory exists, the warning says the parts are spread and names the judgement: move a part in the model when it belongs to another module, or move the code into one behavior folder and tell the user
- [x] #4 A model that binds no code gets no such warning, and a container whose parts bind symbols in its own bound file is contained
- [x] #5 The consumer skill tells an agent to bind each container to the directory that holds its parts, to read the warning before acting, and to tell the user when the code layout splits a behavior
- [x] #6 Focused tests own each case through the machine-readable fields, not the wording
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a containment rule to the semantics structure check beside CONTAINER_PASS_THROUGH. 2. Direct its message: name the directory to bind, or the parts outside, and the judgement for spread parts. 3. Focused tests in structure.test.ts. 4. Consumer skill guidance in Give each container a job, plus CONTEXT and check docs that list the codes. 5. Measure on this repository.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rule in packages/model/src/runtime/operations/check/containment.ts, wired in structure.ts, with suggestedBinding on VaultDiagnosticSchema. Sol (gpt-6.1-sol, xhigh) round 1 found S1 repository-root bindings, S2 shared directory for nested directories and symbol-only parts, and S3 a Rust suffix match that let private test imports through, each fixed in its own commit. Round 2 approved. structure.test.ts 34 pass, code-intel 371 pass, bun run check 21 of 21. This repository: 44 CONTAINER_UNBOUND and 40 CONTAINER_PARTS_OUTSIDE on current, one with suggestedBinding; TASK-582.03 plans the layout that repairs them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The semantics check holds each container to one directory that owns its parts: CONTAINER_UNBOUND and CONTAINER_PARTS_OUTSIDE, with suggestedBinding when one directory holds every part and no other module's code, and the judgement for spread parts otherwise. The consumer skill, archboard-dev and check help say how to act, including telling the user when the code layout splits a job. Follow-up: TASK-582.03.
<!-- SECTION:FINAL_SUMMARY:END -->
