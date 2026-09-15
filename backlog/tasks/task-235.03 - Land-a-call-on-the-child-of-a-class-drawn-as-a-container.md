---
id: TASK-235.03
title: Land a call on the child of a class drawn as a container
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 18:52'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/authoring.md
parent_task_id: TASK-235
ordinal: 398000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two of three candidate S00 runs landed the request_context call on the Request context container after giving it children (push, pop), which the scenario forbids and the rubric calls incorrect. The candidate rule at SKILL.md step 2 says a container is an endpoint only when the source addresses the whole module, and its own example draws Request context as a childless module that receives push; once an author adds children the rule is silent on where the call moves. Baseline made a different mistake (a preprocess to dispatch chain) that the candidate text fixed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The evidence step and the authoring reference say that a part drawn with children is a container and a call to it lands on the child whose body runs, with the RequestContext.push example
- [ ] #2 The guidance says that giving an existing part children re-targets every relationship that landed on it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the evidence step 2 container rule with the class-with-children case. 2. Same in authoring.md Containment and receivers.
<!-- SECTION:PLAN:END -->
