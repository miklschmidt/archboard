---
id: TASK-559.11
title: Catch containers with no code and no job
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T16:45:00Z'
updated_date: '2026-10-30T17:17:00Z'
labels:
  - cli
  - skills
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 983000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner decided that the consumer skill and archboard check must catch containers with no code and no job of their own, so that numbered layers do not return.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check` warns on a pass-through container and on a root with no relationship
- [x] #2 The warning names the module and what the author can do next, and no write is refused
- [x] #3 The consumer skill teaches the same rule
- [x] #4 This repository passes with no such warning, or each remaining warning carries a stated job
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check warns with CONTAINER_PASS_THROUGH and ROOT_UNCONNECTED, and refuses no write. A lone root and a model that binds no code are exempt. The consumer skill teaches the rule. This repository now has no such warning. OVERVIEW_CROWDED and CONTAINER_LINE_TO_OWN_PART of ADR 0052 have no code owner today.
<!-- SECTION:FINAL_SUMMARY:END -->
