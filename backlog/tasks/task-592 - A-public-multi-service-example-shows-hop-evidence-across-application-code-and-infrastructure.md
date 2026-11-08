---
id: TASK-592
title: >-
  A public multi-service example shows hop evidence across application code and
  infrastructure
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T12:42:00Z'
updated_date: '2026-11-08T12:09:00Z'
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
- [x] #1 A separate public repository holds application services, Kubernetes manifests or OpenTofu, and a vault with bindings
- [ ] #2 After a clone, `archboard check code` reports at least one hop-backed finding with an excerpt from each end
- [x] #3 The example names no employer system
- [x] #4 A screen recording of 10 to 20 seconds shows the finding
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The example is two public repositories, as the owner chose: miklschmidt/archboard-relay-example (four TypeScript services, the vault, bindings) and miklschmidt/archboard-relay-example-infra (Kubernetes manifests and OpenTofu). The model was rebuilt with history that a clone can read (model rpmPjlm0, history on origin/archboard-history). No employer system is named: a search of both repositories for the employer found nothing. docs/clips/gate.gif is 16.8 s and shows the finding. On fresh clones, with an isolated XDG_STATE_HOME, archboard check code exits 0, exits 1 after npm run gate:break with RELATIONSHIP_UNDRAWN and the path and line of each end (services/intake/src/accept.ts:51 and deploy/kubernetes/peer-endpoints.yaml:13), and exits 0 after gate:restore. AC 2 stays open: the CLI's answer names the path and line of each end but has no excerpt. The excerpt of each end shows in the check Action's annotation and job summary (relay PR #1), not in archboard check code itself.
<!-- SECTION:NOTES:END -->
