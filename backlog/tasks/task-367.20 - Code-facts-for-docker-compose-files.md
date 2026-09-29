---
id: TASK-367.20
title: Code facts for docker-compose files
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 628000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docker-compose is the smallest infrastructure description, and many repositories run their local system with it. Its services name each other directly, so it is the easiest place to join code and infrastructure evidence first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Services, networks and volumes are definitions
- [ ] #2 `depends_on`, links, and environment values that name another service are configured paths, and a shared volume is a data relationship
- [ ] #3 Override files merge in the order compose uses, and an env file contributes names only, never values
- [ ] #4 Parts bound to compose services get the anchor, binding and undrawn checks
<!-- AC:END -->
