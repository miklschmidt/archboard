---
id: TASK-682
title: 'Terraform: let a part bind a nested block of a resource'
status: Done
assignee: []
created_date: '2026-11-26T00:45:00Z'
updated_date: '2026-11-26T10:30:00Z'
labels:
  - ready-for-agent
  - enhancement
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/issues/166
ordinal: 1169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Problem Statement

A single Terraform or OpenTofu resource often holds several distinct architectural parts that a reader needs to see separately. For example, an Azure Application Gateway declares each `http_listener`, `request_routing_rule`, and `backend_address_pool` as a nested block, each with its own host names, certificates, TLS rules, and backend routing.

Today Archboard binds a Terraform part only to top-level addresses (a resource, data source, ephemeral resource, or module call). Nested blocks receive no definition, so parts drawn inside a resource container stay unbound. The code check then skips those parts as `unbound` and stops judging anchors on every relationship touching them, silencing real `ANCHOR_MISMATCH` warnings.

In addition, when a resource becomes a container with parts inside it, relationships belonging to the resource as a whole (such as diagnostics or key-vault access) cannot sit on the container itself because `RELATIONSHIP_ON_CONTAINER` forbids whole-module endpoints. Yet an inner leaf part for the resource as a whole cannot bind the same resource address without triggering `BINDING_SHARED`, leaving its relationships unjudged as well.

## Solution

Let a Terraform code binding and an anchor address a named direct child block of a `resource` block using the form `<resource_address>.<block_type>["<name>"]` (for example, `azurerm_application_gateway.ingress.http_listener["device-https"]`).

- Each unique depth-1 nested block of a `resource` with a literal `name` attribute becomes a bindable definition spanning that block's lines, so the code check, code opener, code browser, locality, and branch footprint all operate on that block's exact source.
- Anchors on sibling nested blocks in the same resource (such as citing `request_routing_rule["device"]` on a relationship from `Device listener` to `Device backend`) are verified by 1-hop intra-resource name links without accepting wrong sibling blocks or whole-resource anchors.
- One direct child of an infrastructure container can share its parent container's infrastructure address without triggering `BINDING_SHARED`, owning the resource's unallocated references so whole-resource relationships can be anchored and judged cleanly.
- Ambiguous duplicate literal `name` blocks report clear missing-symbol warnings, while dynamic blocks, computed names, and plan-only remote resources skip with `expression-not-followed` instead of producing false warnings.

## User Stories

1. As an architect, I want to split a large Terraform resource (such as an Azure Application Gateway or Network Security Group) into parts bound to individual named nested blocks, so that the model shows each listener, rule, or pool separately while keeping code verification active.
2. As an authoring agent, I want to bind a part to a named nested block with `<resource_address>.<block_type>["<name>"]`, so that the address form is natural to write and guess from Terraform conventions.
3. As an authoring agent, I want to bind a nested block inside a module call or indexed resource (such as `module.api[0].azurerm_application_gateway.ingress["blue"].http_listener["device-https"]`), so that instance keys on modules and resources normalize cleanly without colliding with the nested block selector.
4. As an authoring agent, I want nested block names containing dots, spaces, slashes, or escaped quotes (such as `"example.com"`) to resolve accurately, so that real cloud resource naming conventions work without workarounds.
5. As an architect, I want positional numeric indices on nested blocks (such as `http_listener[0]`) to be refused rather than silently matching, so that bindings never silently shift onto the wrong block when a file is edited.
6. As an architect, I want a relationship from a nested-block part to be anchorable on a 1-hop name-linked sibling block in the same resource (such as `request_routing_rule["device"]` proving `Device listener -> Device backend`), so that I do not have to invent artificial routing-rule parts just to satisfy the code check.
7. As an architect, I want an anchor citing the wrong sibling block (such as `request_routing_rule["public"]` or `http_listener["public-https"]` on `Device listener -> Device backend`) to warn `ANCHOR_MISMATCH`, so that miswired anchors are caught.
8. As an architect, I want an anchor citing the whole enclosing resource (such as `azurerm_application_gateway.ingress`) on a relationship whose end binds a nested block to warn `ANCHOR_MISMATCH`, so that anchors prove relationships with the specific block rather than hand-waving at the entire resource.
9. As an architect, I want an anchor citing a nested block in a different resource to warn `ANCHOR_MISMATCH`, so that cross-resource anchor mistakes are caught.
10. As an architect, I want an anchor on a nested block inside a local module to be recognized as held by a part bound to that module call (such as `module.gw`), so that module-level containers do not get false `ANCHOR_MISMATCH` warnings.
11. As an architect, I want intra-resource string name links to support anchors only and not generate `configured-path` evidence between co-located nested blocks, so that internal resource wiring (such as listeners sharing a frontend port or certificate) never creates noisy `RELATIONSHIP_UNDRAWN` warnings.
12. As an architect, I want HCL references written inside a bound nested block to be attributed as evidence from that nested-block part rather than the enclosing resource, so that outgoing relationships from individual sub-blocks are verified against the right part.
13. As an architect, I want HCL references inside unbound nested blocks to remain owned by the enclosing resource, so that existing resource-level evidence stays intact.
14. As an architect, I want existing Terraform resources containing named nested blocks (such as `env { name = ... }`, `container { name = ... }`, or joining declarations with nested blocks) to keep identical evidence, joining behavior, and runner environment joins when no part binds a nested block, so that no existing model regresses.
15. As an architect, I want to place one direct child part inside an infrastructure container bound to the same infrastructure address (for example, a "Gateway" part inside the "Application Gateway" container, both bound to `azurerm_application_gateway.ingress`), so that whole-resource relationships satisfy `RELATIONSHIP_ON_CONTAINER` without triggering `BINDING_SHARED`.
16. As an architect, I want the semantics check to still warn `BINDING_SHARED` if a second sibling part also binds that same infrastructure address, or if non-infrastructure modules share a binding, so that duplicate bindings remain caught.
17. As an architect, I want unallocated references on a resource shared between a container and its direct child part to be owned by the deeper child part rather than both, so that drawing the relationship on the child clears `RELATIONSHIP_UNDRAWN` cleanly.
18. As an architect, I want a container bound to a Terraform nested block to receive the same infrastructure containment exemption as a resource or module call, so that parts inside it do not trigger false `CONTAINER_PARTS_OUTSIDE` warnings.
19. As an authoring agent, I want a resource declaring two nested blocks of the same type with the same literal `name` to emit no definition for that name and produce a `BINDING_SYMBOL_MISSING` or `ANCHOR_SYMBOL_MISSING` warning that explicitly explains the ambiguity, so that I know why the symbol did not bind.
20. As an architect, I want an unmatched nested-block selector on a resource that has a `dynamic "<type>"` block or a `<type>` block with a computed/interpolated `name` to skip with `expression-not-followed` naming the file and line, so that dynamic HCL does not fail the check with false missing-symbol warnings.
21. As an architect, I want a nested-block selector targeting a resource known only through `--plan` JSON to skip with `expression-not-followed` naming the plan path, so that Archboard never reads sensitive `constant_value` fields from plans and never produces false missing-symbol warnings.
22. As an architect, I want "Open the code" on a nested-block part to jump straight to the first line of that nested block, so that inspecting a listener or rule lands on its exact lines.
23. As an architect, I want the code browser to highlight each bound nested block's exact line span inside its Terraform file, so that I can see which part owns which block at a glance.
24. As an architect, I want locality and branch footprint to attribute commits that edit only one nested block to that block's part rather than untouched sibling blocks, so that change history and PR footprints stay precise.
25. As an authoring agent, I want the `archboard` authoring guide, CLI check help, and documentation site to explain Terraform nested-block bindings, sibling anchors, the direct-child infrastructure exception, and that a nested-block binding is not a runner, so that I author valid models on the first attempt.

## Implementation Decisions

- **Addressing and positional parsing (Fact analysis):** Parse Terraform symbols by grammar position rather than stripping all bracketed segments. Strip instance keys on `module.<name>[...]` and `<type>.<name>[...]`, preserve the single trailing `<block_type>["<name>"]` selector with canonical unescaping of quoted strings (supporting dots, spaces, and slashes inside the name), and reject numeric index selectors on nested blocks. Share this parser across symbol lookup, definition-site resolution, configuration declaration lookup, and the code opener so instance keys normalize consistently everywhere.
- **Nested block discovery scope (Fact analysis):** Emit definitions only for direct child blocks (depth 1) of top-level `resource` blocks that declare a literal `name` attribute. Give each definition `visibility: "block"`, `kind: "value"`, `exposed: false`, and the block's line range and UTF-16 source offsets.
- **Resource-level invariants (Fact analysis and Code check):** Keep reference holder attribution, configuration endpoints, joining-declaration evaluation, and Terraform runner environment extraction strictly at top-level declaration granularity (ignoring `visibility === "block"`). Register nested blocks in configuration site maps under their start line so module-bound containers still hold declarations inside their local modules.
- **Duplicate names and unfollowed dynamic/plan selectors (Fact analysis and Code check):** If two or more direct child blocks of the same type inside one `resource` share the same literal `name`, emit no definition for that symbol and record the duplicate ambiguity so `BINDING_SYMBOL_MISSING` and `ANCHOR_SYMBOL_MISSING` state that multiple blocks share that name. If an unmatched nested selector targets a resource that has a `dynamic "<type>"` block, a `<type>` block with a non-literal `name`, or a resource known only from `--plan` JSON, return an unfollowed result that reports the existing `expression-not-followed` skip reason naming the file and line (or plan path).
- **1-hop intra-resource sibling name links (Fact analysis and Code check):** Within each `resource` block, compute 1-hop sibling links between its unique named nested blocks whenever one block contains an attribute (anywhere in its body) whose name contains the other block's type as an underscore-bounded segment (such as `http_listener_name`, `default_http_listener_name`, or `backend_address_pool_names`) and whose literal string or literal list element matches the other block's literal `name`. Store only resolved block symbols on the file's code facts—never raw string values—preserving ADR 0046's secret-safety invariant. In anchor support, accept an anchor on nested block B for an end bound to nested block S in the same resource when B equals S or B and S are directly linked (1 hop, either direction). Keep name links anchor-only (do not emit `configured-path` evidence). Continue warning `ANCHOR_MISMATCH` when a relationship on a nested-block end cites the enclosing whole resource.
- **Evidence ownership refinement (Code check):** Refine Terraform evidence ownership so HCL references written inside a bound nested block belong to the part(s) bound to that nested block, while references in unbound nested blocks remain owned by the enclosing resource's owners. When a container and a direct descendant share the same infrastructure binding, break ownership ties in favor of the deeper descendant part so unallocated resource references belong to that child without duplicate `RELATIONSHIP_UNDRAWN` findings on the container.
- **Containment and shared-binding rules (Architecture runtime API):** Extend Terraform address recognition in containment to accept one optional trailing nested-block segment. Reuse the shared infrastructure-binding predicate in duplicate-binding checks to exempt at most one direct child whose code binding equals its direct parent container's infrastructure address from `BINDING_SHARED`, while continuing to warn if a second sibling shares the same binding or if non-infrastructure modules share a binding.
- **History lens compatibility (History lens):** No code changes are required in History lens because the dotted resource prefix keeps nested blocks related to their enclosing resource and Terraform configuration resolves nested block definitions directly.
- **CLI help, consumer skill, and docs (Commands and documentation):** Update check command help, the `archboard` authoring reference (including noting that a nested-block binding is not a runner), and affected documentation pages in sync, verified by the docs site build.

## Architecture Proposal

- Proposal: "Terraform nested block bindings", `qkPB3Whk`, in model `vKEsyHFk` (predecessor "Terraform joining anchors judged by what they reach", `eWn1Z5xB`).
- Link: http://127.0.0.1:3000/?modelA=vKEsyHFk&stateA=qkPB3Whk (or http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=qkPB3Whk on a release server), compared with Current by default.
- Picture: `archboard model render --state qkPB3Whk --out <file>` draws it.
- Changes:
  - Interface: no container interface changes across all 108 containers.
  - Changed: **Fact analysis** parses Terraform addresses by position to preserve trailing nested-block selectors, emits depth-1 `resource` nested blocks with literal `name` as `visibility: "block"` definitions without pulling references or runners off the enclosing resource, records 1-hop intra-resource sibling name links as resolved block symbols only, flags duplicate literal names as ambiguous, and marks dynamic, computed-name, or plan-only nested selectors as unfollowed.
  - Changed: **Code check** accepts 1-hop intra-resource name-linked sibling blocks for anchor support (anchor-only, still warning on whole-resource anchors for nested-block ends), attributes references inside bound nested blocks to those parts, prefers a direct child sharing its parent infrastructure address in ownership, skips dynamic/computed/plan-only nested selectors with `expression-not-followed`, and reports ambiguity on duplicate literal names.
  - Changed: **Architecture runtime API** recognizes Terraform nested-block addresses in containment and exempts at most one direct child sharing its parent container's infrastructure address from `BINDING_SHARED`.
  - Changed: **Commands** updates `check code` and `check semantics` help for Terraform nested-block bindings, `expression-not-followed`, and the direct-child infrastructure exception to `BINDING_SHARED`.

## Testing Decisions

- A good test drives the product through its public interface and asserts external behavior—findings, skips, line targets, file owners, and attributed commits—without asserting internal helpers.
- **Primary seam — Code check pass:** Run the code check over temporary Git fixtures with Terraform configurations and models (prior art: the Terraform code-check and Terraform provider tests in `code-intel`). Cover:
  - Binding parts and anchors to depth-1 named nested blocks, including module-nested and indexed resources, quoted names containing dots/spaces/escapes, and rejection of numeric indices.
  - 1-hop sibling anchor support (including the Azure Application Gateway `http_listener` + `request_routing_rule` example from #166), plus `ANCHOR_MISMATCH` for wrong sibling blocks, cross-resource blocks, and whole-resource anchors on nested-block ends.
  - Module-bound container (`module.gw`) holding a nested-block anchor inside a local module.
  - HCL reference ownership attributed to bound nested-block parts vs. unbound blocks staying on the resource, and deeper-part ownership for a direct child sharing its parent container's infrastructure address.
  - Invariance test: a fixture with named nested blocks (`env`, `container`, joining declarations) and no part bound to a nested block produces identical findings, evidence, and runners as before.
  - Duplicate literal `name` ambiguity warning, and `expression-not-followed` skips for `dynamic "<type>"`, computed `name`, and `--plan`-only remote resources.
- **Secondary seam — Semantics check:** Test containment and duplicate-binding diagnostics directly through the model check operations (prior art: the structure check tests in `model`). Cover nested-block recognition in containment and the `BINDING_SHARED` single-direct-child infrastructure exception (including still warning on a second sibling and on non-infrastructure duplicates).
- **Existing entry-point seams — Code opener, code browser, and History lens:** Add focused tests through `symbolLine`, `readFileOwners`, and commit/footprint attribution confirming nested-block line jump, code-browser symbol highlights, and isolated single-block commit attribution.
- **Docs and CLI reference seam:** Run the docs site build to verify CLI help contracts, guides, and internal links stay valid.

## Out of Scope

- Nested blocks deeper than depth 1 (for example `url_path_map["api"].path_rule["v1"]`).
- Nested blocks of `data`, `ephemeral`, or `module` blocks.
- Identifier attributes other than `name` (such as `id`, `origin_id`, or `sid`).
- Positional numeric indices on nested blocks (such as `http_listener[0]`).
- Emitting `configured-path` relationship evidence from intra-resource string name links.
- Treating a part bound to a nested block as an infrastructure runner.
- Reading `constant_value` fields from Terraform plan JSON files (forbidden by ADR 0046).
- Adding Azure top-level joining declarations to the provider rules table (tracked separately in #165).

## Further Notes

- Originating issue: https://github.com/miklschmidt/archboard/issues/166 (related context: https://github.com/miklschmidt/archboard/issues/165).
- Design reviewed with Fable as advisor and aligned with ADR 0046.
- **Coordination with #165 (`fix/issue-165-design`, proposal `eWn1Z5xB`):** Land #165 first, then rebase `feat/terraform-nested-blocks` onto `main` and reconcile proposal `qkPB3Whk` before implementing `TASK-682`. #165 introduces per-instance Terraform anchor judgement (listed joins + silent structural HCL reach for unlisted top-level declarations), `selfEnd` handling in `endOf`/`joinedBy`, and updates to the authoring reference and the descriptions of Fact analysis and Code check. Reconciling after #165 lands keeps anchor judgement in one unified Terraform path, avoids merge churn in evidence and authoring docs, and settles the description edits on Fact analysis and Code check cleanly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Parts and anchors can bind depth-1 named nested blocks of Terraform resource blocks using <resource_address>.<block_type>["name"], with module and resource instance keys normalized by position, quoted names with dots/spaces/escapes supported, and numeric indices rejected
- [x] #2 Anchoring a relationship on a 1-hop intra-resource name-linked sibling block supports a nested-block end (anchor-only), while wrong sibling blocks, cross-resource blocks, and whole-resource anchors on nested-block ends warn ANCHOR_MISMATCH
- [x] #3 HCL references inside bound nested blocks are attributed to those parts, unbound blocks remain owned by the resource, and fixtures with named nested blocks (including env, container, and joining blocks) but no nested-block bindings produce unchanged findings and runners
- [x] #4 Semantics checks recognize nested-block addresses in Terraform containment and exempt at most one direct child sharing its parent container infrastructure address from BINDING_SHARED (while still warning on a second sibling or non-infrastructure duplicates), with code-check ownership preferring the deeper child part
- [x] #5 Duplicate literal names of the same block type in one resource produce no definition and report ambiguity in BINDING_SYMBOL_MISSING / ANCHOR_SYMBOL_MISSING; unmatched selectors with dynamic blocks, computed names, or plan-only remote resources skip with expression-not-followed
- [x] #6 Code opener (symbolLine), code browser file owners, and History lens footprint/locality work for nested-block bindings
- [x] #7 Authoring skill reference, CLI check help, and docs site are updated in sync and the site build passes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented Terraform depth-1 named nested-block bindings and 1-hop sibling-block anchors for GitHub issue #166 across packages/model, packages/code-opener, packages/code-intel, skills/archboard, apps/cli, and site/src/content/docs. Added positional nested-block address parsing and normalization (plus indexed/chained module-output reference anchors), HCL nested-block extraction and 1-hop intra-resource name-linked sibling anchor verification, per-block HCL evidence attribution with zero-nested-block invariance, Terraform containment and single-direct-child infrastructure BINDING_SHARED exemption with deeper-child ownership, duplicate-name ambiguity and expression-not-followed skips, file-bound code-opener/code-browser/history-lens support, and synced authoring skill, CLI help, and docs site. Adopted Archboard proposal qkPB3Whk.
<!-- SECTION:FINAL_SUMMARY:END -->
