---
id: TASK-367.19
title: Code facts for Kubernetes manifests
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
ordinal: 627000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kubernetes manifests declare how traffic reaches a workload and which services a workload is configured to call. The check reads manifest files only, including Helm or Kustomize output that somebody rendered to files. It never talks to a cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workloads, Services, Ingresses, Gateway routes, NetworkPolicies, ConfigMaps and Secrets are definitions, addressed as kind and name
- [ ] #2 A Service selector to a workload and an environment value that names a Service are configured paths, a route to a Service is a call, and a NetworkPolicy that allows traffic is a permission
- [ ] #3 Multi-document YAML files work, and Secret values are never read
- [ ] #4 Parts bound to manifests get the anchor, binding and undrawn checks
<!-- AC:END -->
