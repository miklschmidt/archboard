---
id: TASK-682.05
title: >-
  Document Terraform nested-block bindings in CLI help, authoring skill, and
  docs site
status: To Do
assignee: []
created_date: '2026-11-26T00:51:00Z'
updated_date: '2026-11-26T01:45:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies:
  - TASK-682.02
  - TASK-682.03
  - TASK-682.04
references:
  - https://github.com/miklschmidt/archboard/issues/166
parent_task_id: TASK-682
ordinal: 1174000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-682, "Terraform: let a part bind a nested block of a resource".

## What to build

Sync every user- and agent-facing description of Terraform bindings, anchors, skips, and shared bindings with the shipped behavior:

- Update `check code` and `check semantics` CLI help to document depth-1 Terraform nested-block bindings and sibling anchors, `expression-not-followed` skips for dynamic/computed/plan-only nested selectors, and the direct-child infrastructure exception to `BINDING_SHARED`.
- Update the consumer `archboard` authoring reference with the nested-block binding form, sibling-block anchor guidance, whole-resource child part pattern, and an explicit note that a nested-block binding is not a runner.
- Audit and update affected documentation pages in the docs site and verify that the full docs site build (including CLI reference generation, guide guards, and internal link checks) passes cleanly.

## Architecture

- Proposal: "Terraform nested block bindings", `qkPB3Whk`.
- Slice: `vKEsyHFk/XppR9owz#bLpk2XKU` (Commands: `check code` and `check semantics` help text) plus unbound consumer skill and documentation files.
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=qkPB3Whk&focusA=vKEsyHFk/XppR9owz%23bLpk2XKU
- Gate: before this ticket merges, `archboard model footprint --base feat/terraform-nested-blocks --head <ticket-branch> --state qkPB3Whk --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-682.02
- TASK-682.03
- TASK-682.04
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CLI check code and check semantics help describe Terraform nested-block bindings, expression-not-followed skips for dynamic/computed/plan-only nested selectors, and the direct-child infrastructure exception to BINDING_SHARED
- [ ] #2 The consumer archboard authoring reference documents nested-block syntax, 1-hop sibling anchors, the direct-child whole-resource pattern, and notes that a nested-block binding is not a runner
- [ ] #3 Affected docs site pages match the shipped behavior and the site build passes with no reference, guide, or link errors
<!-- AC:END -->
