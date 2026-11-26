---
id: TASK-681
title: Judge Terraform joining anchors per instance and add missing Azure rules
status: In Progress
assignee: []
created_date: '2026-11-26T00:43:00Z'
labels: []
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/issues/165
ordinal: 1171000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Relationship anchors citing Azure joining declarations like azurerm_subnet_nat_gateway_association or azurerm_monitor_diagnostic_setting fail with ANCHOR_MISMATCH because they are absent from the AZURE provider table and support.ts only exempts listed types. Meanwhile, listed joins currently bypass anchor pair validation even when they connect two different bound parts, and endOf in terraform-evidence.ts falls back to the joining declaration itself when an external end is opaque, risking false self-evidence. Tracks GitHub issue #165 and Archboard proposal eWn1Z5xB (Terraform joining anchors judged by what they reach).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Azure provider table adds configured-path join rules for azurerm_subnet_nat_gateway_association, azurerm_monitor_diagnostic_setting (without eventhub_authorization_rule_id), azurerm_private_dns_zone_virtual_network_link, and azurerm_nat_gateway_public_ip_association
- [ ] #2 Provider join rules distinguish genuine self-endpoints from pure-link declarations so endOf never falls back to the declaration itself when an external end is unresolved
- [ ] #3 Anchor support judges Terraform declarations per instance: unlisted declarations reaching both claimed ends pass cleanly without emitting undrawn evidence, while listed joins validate their endpoint roles per instance and warn ANCHOR_MISMATCH when every instance resolves both sides to other bound parts
- [ ] #4 Undirected Azure NSG associations stay unlisted so anchored dependencies pass cleanly without triggering RELATIONSHIP_UNDRAWN
- [ ] #5 Integration tests cover all new rules, wrong-pair warnings, opaque external ends, module instances, and unlisted NSG associations; docs and proposal eWn1Z5xB stay aligned
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Proposal: Terraform joining anchors judged by what they reach (eWn1Z5xB, predecessor LzXvT7U7, model vKEsyHFk, vault .archboard/vault). Affected modules: Fact analysis (vKEsyHFk/6E6hL0Zk#3CaBjhIM) and Code check (vKEsyHFk/HBlhIeSD#5SMX69gS). 1. Update terraform-providers.ts with self-end metadata on Join and the 4 directed Azure rules. 2. Update terraform-evidence.ts endOf to use self-end metadata. 3. Update support.ts to judge Terraform declarations per instance for both listed joins and unlisted structural reach. 4. Update headers and skills/archboard/references/authoring.md. 5. Add integration tests in terraform-providers.test.ts and run full verification.
<!-- SECTION:PLAN:END -->
