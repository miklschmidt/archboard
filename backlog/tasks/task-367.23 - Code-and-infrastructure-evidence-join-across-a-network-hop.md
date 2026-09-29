---
id: TASK-367.23
title: Code and infrastructure evidence join across a network hop
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
dependencies:
  - TASK-367.07
  - TASK-367.20
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 631000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Code shows that a part reads a configuration value such as `QUEUE_URL`. Infrastructure shows that the value is set, for that service, to the address of another part. Together they prove a relationship that neither proves alone. docker-compose comes first, because its services name each other directly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A code anchor that reads an environment value, together with a compose file that sets the value for that part's service to another part's address, supports the relationship between the two parts as a configured path
- [ ] #2 The same join works for Kubernetes environment values and Terraform settings when those adapters are present
- [ ] #3 A relationship across a network hop that no evidence supports is reported as unsupported, and one with evidence only on one side says which side is missing
<!-- AC:END -->
