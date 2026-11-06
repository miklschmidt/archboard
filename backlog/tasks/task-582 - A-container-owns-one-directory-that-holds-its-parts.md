---
id: TASK-582
title: A container owns one directory that holds its parts
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T15:13:00Z'
updated_date: '2026-11-06T15:14:00Z'
labels:
  - model
  - check
dependencies: []
priority: high
ordinal: 1023000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A module with parts that has no binding leaves the code of its own folder to no module, so the code check cannot see calls into that code (for example `crates/archboard-scene/src/paint/design.rs`, which five crates import). The owner decided on 2026-11-06 that a container binds one directory that holds every part, as a well-structured codebase allows, and that a container whose parts are spread over the codebase gets a warning. ADR 0056 stays: one path per binding. This repository fails the rule in 84 of 110 containers, because docs/agents/boundaries.md lays code out role first, so one behavior lives in several role folders. The owner decided that behavior first is the right layout, and that agents must tell users when the structure of their code limits what archboard can check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The work splits into the containment warning with its skill guidance, the Painting repair, and the behavior-first layout
<!-- AC:END -->
