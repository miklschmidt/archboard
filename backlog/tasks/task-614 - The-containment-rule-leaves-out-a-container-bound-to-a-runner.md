---
id: TASK-614
title: The containment rule leaves out a container bound to a runner
status: In Progress
assignee: []
created_date: '2026-11-08T23:29:00Z'
labels:
  - bug
  - model
dependencies: []
priority: high
ordinal: 1063000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The containment rule (TASK-582.01, #49) warns CONTAINER_PARTS_OUTSIDE when a part binds code outside its container. ADR 0046 and the Kubernetes, compose and Terraform runners model a deployed service the other way: the container binds the workload that runs it, such as `Deployment/billing` in a manifest of an infrastructure repository, and its parts are the code that workload runs, wherever that code lives. That join is what lets the code check follow a URL that a manifest sets to the code behind it. So the relay example, which follows ADR 0046, fails `archboard check` with five warnings, and binding its services to their code folders instead loses the undrawn call that the gate guide demonstrates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A container bound to a Kubernetes object, a compose service, or a Terraform or OpenTofu resource address gets neither CONTAINER_UNBOUND nor CONTAINER_PARTS_OUTSIDE
- [ ] #2 A container bound to a code file, a code symbol, or a YAML file without an address still gets CONTAINER_PARTS_OUTSIDE when a part is outside it
- [ ] #3 archboard check all passes on the main branch of miklschmidt/archboard-relay-example, and still reports RELATIONSHIP_UNDRAWN on its pull request #1
- [ ] #4 The consumer skill says that a deployed service binds its runner
<!-- AC:END -->
