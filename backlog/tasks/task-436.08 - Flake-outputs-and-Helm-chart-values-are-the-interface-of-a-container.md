---
id: TASK-436.08
title: Flake outputs and Helm chart values are the interface of a container
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 702000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For a container bound to a Nix flake, a Kubernetes manifest or a compose file, the code check reports the skip `exposure-unknown`, because these have no module in the sense of code. The owner decided that the outputs of a flake and the values of a Helm chart are the interface that they expose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a container bound to a flake, the outputs of `flake.nix` are its exposed names, and the interface findings of ADR 0044 apply to it
- [ ] #2 For a container bound to a Helm chart, the values in `values.yaml` are its exposed names, and the interface findings of ADR 0044 apply to it
- [ ] #3 A compose file and a plain Kubernetes manifest still give `exposure-unknown`, and an amendment of ADR 0044 records the rule
<!-- AC:END -->
