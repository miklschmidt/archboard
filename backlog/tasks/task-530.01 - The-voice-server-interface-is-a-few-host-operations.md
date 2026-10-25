---
id: TASK-530.01
title: The voice server interface is a few host operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 939000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard imports about 107 internal names (epoch stores, wait graphs, thread-link proofs, callback ports) that the example does not need, and the core hard-codes Archboard identity: serviceName, threadSource, tool namespaces, the coordinator manifest text and the spoken-approval prompt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The server, runtime and shared entries expose only host-facing operations, options and types
- [ ] #2 Identity strings on the wire and in prompts are host options with neutral defaults, and Archboard passes its existing values
- [ ] #3 The browser socket wiring the example hand-writes is a package operation
- [ ] #4 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
<!-- AC:END -->
