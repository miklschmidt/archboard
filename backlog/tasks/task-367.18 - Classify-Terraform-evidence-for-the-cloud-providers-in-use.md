---
id: TASK-367.18
title: Classify Terraform evidence for the cloud providers in use
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
  - needs-info
dependencies:
  - TASK-367.17
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 626000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most references in a Terraform configuration are about provisioning, such as a role or a log group attached to a function. Only some are relationships at run time: a trigger, a subscription, a listener, a network rule. Without a rule per provider, the undrawn check reports every provisioning reference as a missing relationship. Which providers to cover first is the user's call. Inframap's per-provider lists are prior art.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The user named the providers to cover first
- [ ] #2 For each named provider, triggers, subscriptions and event mappings are calls, listeners, target groups and network rules are configured paths, grants are permissions, and the rest is provisioning
- [ ] #3 Provisioning references are not reported as missing relationships
<!-- AC:END -->
