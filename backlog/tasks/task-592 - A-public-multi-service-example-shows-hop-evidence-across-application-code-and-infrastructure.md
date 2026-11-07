---
id: TASK-592
title: >-
  A public multi-service example shows hop evidence across application code and
  infrastructure
status: To Do
assignee: []
created_date: '2026-11-07T12:42:00Z'
labels: []
dependencies: []
references:
  - >-
    https://cursor.com/canvas/store-d9868b7b-a3f5-460e-bddf-04ada008b440/eac44d3b-26a6-4e70-abab-be87cdf17052
priority: high
type: feature
ordinal: 1038000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Platform engineers, SREs and staff engineers ask which service talks to which across application code and infrastructure. `archboard check code` can follow a connection across a network hop when the code and the infrastructure both declare it, but no public example shows this. The owner uses it most on an employer codebase, which cannot be shown (P0 of the market research).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A separate public repository holds application services, Kubernetes manifests or OpenTofu, and a vault with bindings
- [ ] #2 After a clone, `archboard check code` reports at least one hop-backed finding with an excerpt from each end
- [ ] #3 The example names no employer system
- [ ] #4 A screen recording of 10 to 20 seconds shows the finding
<!-- AC:END -->
