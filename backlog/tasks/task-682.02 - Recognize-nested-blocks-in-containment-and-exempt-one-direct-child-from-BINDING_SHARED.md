---
id: TASK-682.02
title: >-
  Recognize nested blocks in containment and exempt one direct child from
  BINDING_SHARED
status: Done
assignee: []
created_date: '2026-11-26T00:50:00Z'
updated_date: '2026-11-26T01:58:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/issues/166
parent_task_id: TASK-682
ordinal: 1171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-682, "Terraform: let a part bind a nested block of a resource".

## What to build

Extend Terraform address recognition in the semantics containment check by one optional trailing nested-block segment so a container bound to a Terraform nested block receives the same infrastructure containment exemption as a resource, data source, or module call (avoiding false `CONTAINER_PARTS_OUTSIDE` warnings).

Reuse the shared infrastructure-binding predicate (covering Terraform/OpenTofu, Kubernetes, and Compose addresses) in duplicate-binding checks so at most one direct child whose code binding equals its direct parent container's infrastructure address is exempt from `BINDING_SHARED`. This allows a whole-resource leaf part inside a resource container (such as a "Gateway" part inside an "Application Gateway" container) to bind the resource and have its relationships judged while still satisfying `RELATIONSHIP_ON_CONTAINER`. A second sibling sharing that same address, or any non-infrastructure shared binding, must still warn `BINDING_SHARED`.

## Architecture

- Proposal: "Terraform nested block bindings", `qkPB3Whk`.
- Slice: `vKEsyHFk/6E6hL0Zk#wYcdVszt` (Architecture runtime API) — Terraform nested-block containment recognition and the single-direct-child infrastructure exception in duplicate-binding checks.
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=qkPB3Whk&focusA=vKEsyHFk/6E6hL0Zk%23wYcdVszt
- Gate: before this ticket merges, `archboard model footprint --base feat/terraform-nested-blocks --head <ticket-branch> --state qkPB3Whk --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Blocked by

- None (can start immediately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Containment diagnostics recognize Terraform nested-block bindings (including inside modules and with instance keys) as infrastructure addresses and emit no CONTAINER_PARTS_OUTSIDE warning for a container bound to one
- [x] #2 Duplicate-binding diagnostics emit no BINDING_SHARED warning when a single direct child shares its parent container infrastructure address (Terraform, Kubernetes, or Compose)
- [x] #3 Duplicate-binding diagnostics still warn BINDING_SHARED when a second sibling shares that same infrastructure address, when an indirect descendant shares it, or when non-infrastructure modules share a binding
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended Terraform address parsing in containment.ts to recognize depth-1 named nested-block selectors by grammar position (exporting namesInfrastructure) and updated sharedBindings in duplicates.ts to exempt at most one direct child sharing its parent container's infrastructure address (order-independent) while still warning on second siblings, indirect descendants, unrelated modules, and non-infrastructure duplicates. Verified with 109 passing tests (including 25 new tests in packages/model/tests/runtime/check/operations/infrastructure.test.ts), full lint (0 warnings/errors), and type-check.
<!-- SECTION:FINAL_SUMMARY:END -->
