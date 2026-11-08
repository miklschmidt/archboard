---
id: TASK-614
title: The containment rule leaves out a container bound to a runner
status: In Progress
assignee: []
created_date: '2026-11-08T23:29:00Z'
updated_date: '2026-11-08T23:41:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Review corrections: restrict compose recognition to the eight filenames that the reader accepts. Support Terraform instance addresses, module calls, and explicit directory paths with dots. Add focused containment regressions and explain the syntactic exception in consumer guidance. Run the requested test, type, and lint commands, then exercise both relay branches.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review affects the model module (vKEsyHFk/vKEsyHFk#DmbKboxU). The module ownership and relationships stay accurate, so these address-recognition corrections need no architecture proposal. The containment rule reads stated bindings only. Its infrastructure exception cannot prove that a declaration runs code.

Review fix: compose recognition now requires a supported compose filename and a nonempty service address. Regression cases for a YAML configuration key, an unsupported compose filename, and an empty service address failed before the fix. All 60 structure tests pass after the fix.

Review fix: Terraform module calls, nested module instances, resource instance keys, and explicit directory paths with dots now receive the infrastructure exception. Six regression cases failed before this fix. All 70 structure tests pass after it. ConfigMap, Secret, and Terraform data addresses retain the syntax-based exception required by the task. A nested code container still receives its own warning. The guidance now explains that source evidence stays with check code. A directory code symbol such as order_service.start remains indistinguishable from a Terraform address without reading files or adding binding metadata; binding the code file removes that ambiguity.

Review fix: the Kubernetes Kind/name form now accepts digits in custom kinds, as the manifest reader does. The Workload2/api regression failed before this correction. The exception still uses the object address within a multi-document YAML file and needs no document index, as the manifest reader addresses objects by kind and name.

Final review validation: all 71 structure tests pass. TypeScript passes with nix develop --command bunx tsc --noEmit -p tsconfig.json. The requested type-aware lint command passes with zero warnings. The repository semantic inspection exits 0. With the final branch source on port 13899, relay main exits 0 and intake-calls-billing exits 1 with only RELATIONSHIP_UNDRAWN at warning severity. Both runs also report four informational EMBED_RENDERER_CHANGED notices for existing example diagrams. Both relay checkouts are clean on main. The standards review has no remaining finding. The spec review corrected compose filename recognition, Terraform module and instance forms, explicit directory paths with dots, and Kubernetes kinds with digits. Skipping every source part is consistent with the runner join across repositories; the runner does not own a code directory in its own repository either. The remaining syntax ambiguity is documented in authoring guidance. Task status stays In Progress for the parent task owner.
<!-- SECTION:NOTES:END -->
