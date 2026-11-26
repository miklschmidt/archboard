---
id: TASK-682.03
title: >-
  Verify 1-hop sibling-block anchors and refine nested-block and direct-child
  evidence ownership
status: To Do
assignee: []
created_date: '2026-11-26T00:51:00Z'
updated_date: '2026-11-26T01:45:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies:
  - TASK-682.01
references:
  - https://github.com/miklschmidt/archboard/issues/166
parent_task_id: TASK-682
ordinal: 1172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-682, "Terraform: let a part bind a nested block of a resource".

## What to build

Support anchors on sibling nested blocks within the same Terraform `resource` block using a generic 1-hop intra-resource name-link rule, and refine Terraform evidence ownership for bound nested blocks and direct-child whole-resource parts.

Within each `resource` block, record 1-hop sibling links between its unique named nested blocks whenever one block contains an attribute (anywhere in its body) whose name contains the other block's type as an underscore-bounded segment (such as `http_listener_name`, `default_http_listener_name`, or `backend_address_pool_names`) and whose literal string or literal list element matches the other block's literal `name`. Store only resolved block symbols on the file's code facts—never raw string values—preserving ADR 0046's secret-safety invariant.

In anchor support, accept an anchor naming nested block B for an end bound to nested block S in the same resource when B equals S or B and S are directly linked (1 hop, either direction). Keep intra-resource name links anchor-support only so they emit no `configured-path` evidence and create no spurious `RELATIONSHIP_UNDRAWN` warnings between co-located blocks. Continue warning `ANCHOR_MISMATCH` for wrong sibling blocks, cross-resource blocks, and whole-resource anchors on relationships whose ends bind nested blocks.

Refine Terraform evidence ownership so HCL references written inside a bound nested block belong to the part(s) bound to that nested block (while unbound nested blocks stay owned by the enclosing resource), and when a container and a direct descendant share the same infrastructure binding, prefer the deeper descendant part so unallocated resource references belong to that child without duplicate `RELATIONSHIP_UNDRAWN` findings on the container.

Note: if #165 has landed on `main`, integrate cleanly with its per-instance Terraform anchor judgement and `endOf` handling in Code check.

## Architecture

- Proposal: "Terraform nested block bindings", `qkPB3Whk`.
- Slice: `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (Fact analysis: 1-hop intra-resource sibling name links) and `vKEsyHFk/HBlhIeSD#5SMX69gS` (Code check: sibling-block anchor support, nested-block reference ownership, deeper-part direct-child ownership preference).
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=qkPB3Whk&focusA=vKEsyHFk/6E6hL0Zk%233CaBjhIM,vKEsyHFk/HBlhIeSD%235SMX69gS
- Gate: before this ticket merges, `archboard model footprint --base feat/terraform-nested-blocks --head <ticket-branch> --state qkPB3Whk --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Blocked by

- TASK-682.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anchoring Device listener -> Device backend on sibling request_routing_rule["device"] passes check code with no ANCHOR_MISMATCH when http_listener_name matches "device-https"
- [ ] #2 Citing the wrong sibling block (such as request_routing_rule["public"] or http_listener["public-https"]), a block in another resource, or the enclosing whole resource when an end binds a nested block warns ANCHOR_MISMATCH
- [ ] #3 Intra-resource name links store only resolved block symbols (never raw string values) and emit no configured-path relationship evidence or RELATIONSHIP_UNDRAWN warnings between co-located nested blocks
- [ ] #4 HCL references inside a bound nested block are owned by that block part while references inside unbound nested blocks remain owned by the enclosing resource
- [ ] #5 When a container and a direct child part share the same infrastructure binding, unallocated resource references are owned by the deeper child part so drawing the relationship on the child leaves no duplicate RELATIONSHIP_UNDRAWN finding on the container
<!-- AC:END -->
