---
id: TASK-682.01
title: Bind and resolve Terraform depth-1 named nested blocks
status: In Progress
assignee: []
created_date: '2026-11-26T00:50:00Z'
updated_date: '2026-11-26T01:45:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/issues/166
parent_task_id: TASK-682
ordinal: 1170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-682, "Terraform: let a part bind a nested block of a resource".

## What to build

Let a Terraform code binding and an anchor name any unique depth-1 nested block of a `resource` block that declares a literal `name` attribute, spelled `<resource_address>.<block_type>["<name>"]` (for example, `azurerm_application_gateway.ingress.http_listener["device-https"]`).

Parse Terraform addresses by grammar position so module and resource instance keys (such as `module.api[0].azurerm_application_gateway.ingress["blue"].http_listener["device-https"]`) normalize away while the trailing nested-block selector stays intact, supporting dots, spaces, slashes, and escapes inside the quoted name and rejecting numeric indices such as `http_listener[0]`. Share that normalization across symbol lookup, definition-site resolution, configuration declaration lookup, and the code opener.

Emit each unique depth-1 named nested block of a `resource` as a definition with visibility `block`, kind `value`, not exposed, spanning the block's lines and UTF-16 source offsets. Keep top-level reference attribution, configuration endpoints, joining-declaration evaluation, and Terraform runner environment extraction strictly at top-level declaration granularity (ignoring `block` definitions) so existing resources with named nested blocks (such as `env`, `container`, and joining blocks) behave identically when no part binds a nested block. Register nested blocks in configuration site maps under their start line so a container bound to a module call (such as `module.gw`) still holds nested-block anchors inside its local module.

With this slice complete, `check code`, "Open the code", the code browser's symbol highlights, and History lens locality and branch footprint all resolve a nested block's exact source lines.

## Architecture

- Proposal: "Terraform nested block bindings", `qkPB3Whk`.
- Slice: `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (Fact analysis) — positional Terraform address parser, depth-1 `resource` nested-block definitions (`visibility: "block"`), definition-site Terraform normalization, site registration, and resource-level guards.
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=qkPB3Whk&focusA=vKEsyHFk/6E6hL0Zk%233CaBjhIM
- Gate: before this ticket merges, `archboard model footprint --base feat/terraform-nested-blocks --head <ticket-branch> --state qkPB3Whk --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Blocked by

- None (can start immediately).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parts and anchors can bind unique depth-1 nested blocks of Terraform resource blocks using <resource_address>.<block_type>["name"], including inside local modules and indexed resources
- [ ] #2 Quoted nested block names containing dots, spaces, slashes, or escaped quotes resolve accurately, and numeric index selectors such as http_listener[0] are rejected
- [ ] #3 A container bound to a local module call (such as module.gw) still holds nested-block anchors declared inside that module
- [ ] #4 An invariance test confirms a fixture with named nested blocks (env, container, joining declarations) and no nested-block bindings produces identical code-check findings, evidence, and runners
- [ ] #5 Code opener (symbolLine), code browser file owners (readFileOwners), and History lens commit/footprint attribution resolve a bound nested block to its exact lines and isolate edits to that block
<!-- AC:END -->
