---
id: TASK-682.04
title: >-
  Report duplicate-name ambiguity and skip dynamic, computed-name, and plan-only
  nested selectors
status: To Do
assignee: []
created_date: '2026-11-26T00:51:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies:
  - TASK-682.03
references:
  - https://github.com/miklschmidt/archboard/issues/166
parent_task_id: TASK-682
ordinal: 1173000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-682, "Terraform: let a part bind a nested block of a resource".

## What to build

Handle the non-unique and dynamically generated cases of Terraform nested-block bindings and anchors cleanly without guessing or emitting false warnings.

When a single `resource` block declares two or more direct child blocks of the same type with the same literal `name`, emit no definition for that duplicated symbol and record the ambiguity so `BINDING_SYMBOL_MISSING` and `ANCHOR_SYMBOL_MISSING` warnings explicitly state that multiple blocks of that type share that name.

When a binding or anchor names a nested-block selector that matches no static literal block, and the target resource contains a `dynamic "<type>"` block, a `<type>` block with a non-literal/interpolated `name`, or is known only through `--plan` JSON (which never reads `constant_value` per ADR 0046), skip the claim with the existing `expression-not-followed` reason naming the file and line (or plan path) rather than warning that the symbol is missing.

## Architecture

- Proposal: "Terraform nested block bindings", `klJZHla2`.
- Slice: `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (Fact analysis: duplicate-name ambiguity detection and unfollowed dynamic/computed/plan-only tracking) and `vKEsyHFk/HBlhIeSD#5SMX69gS` (Code check: ambiguity messaging in symbol-missing warnings and `expression-not-followed` skips).
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=klJZHla2&focusA=vKEsyHFk/6E6hL0Zk%233CaBjhIM,vKEsyHFk/HBlhIeSD%235SMX69gS
- Gate: before this ticket merges, `archboard model footprint --base feat/terraform-nested-blocks --head <ticket-branch> --state klJZHla2 --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-682.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Two or more direct child blocks of the same type with the same literal name in one resource emit no definition and produce a BINDING_SYMBOL_MISSING or ANCHOR_SYMBOL_MISSING warning explaining that multiple blocks share that name
- [ ] #2 An unmatched nested-block selector on a resource with a dynamic "<type>" block skips with expression-not-followed naming the file and line
- [ ] #3 An unmatched nested-block selector on a resource with a <type> block whose name is computed or interpolated skips with expression-not-followed naming the file and line
- [ ] #4 A nested-block selector targeting a resource known only through --plan JSON skips with expression-not-followed naming the plan path without reading constant_value
- [ ] #5 An unmatched nested-block selector on a static resource with no dynamic or computed-name block of that type still warns BINDING_SYMBOL_MISSING or ANCHOR_SYMBOL_MISSING
<!-- AC:END -->
