---
id: TASK-530.02
title: The voice browser interface is one client and React hooks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A host writes a 272-line client to combine the transport and media owners, and generic browser state (approvals, queue, composer, thread link, voice session, sign-in) lives in Archboard packages/workbench.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A framework-agnostic client owns connection, conversation, approvals and voice state
- [ ] #2 React hooks at the react entry expose that client
- [ ] #3 Archboard and the example UI use the client and hooks
- [ ] #4 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
<!-- AC:END -->
