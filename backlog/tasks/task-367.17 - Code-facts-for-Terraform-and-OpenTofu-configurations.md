---
id: TASK-367.17
title: Code facts for Terraform and OpenTofu configurations
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
ordinal: 625000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Infrastructure declares the relationships that code analysis cannot see: the queue a function reads, the route to a service. The check reads `.tf` and `.tofu` files statically, with no `init`, no credentials and never the state, because state holds secrets in plain text. A part binds to a resource address through the binding symbol.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Resources, data sources, modules, variables and outputs are definitions with their addresses, and the references in expressions are references
- [ ] #2 A part bound to a resource address is reported when the configuration no longer declares it
- [ ] #3 A relationship between two resource-bound parts is supported when a reference joins them, and references that the board does not draw are reported as in the undrawn check
- [ ] #4 A plan JSON from `terraform show -json` or `tofu show -json` is an optional input when an agent names one
- [ ] #5 The check never reads state, never runs `terraform` or `tofu`, and never reads a secret value
<!-- AC:END -->
