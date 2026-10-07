---
id: TASK-448
title: Locality and footprint attribute commits to bound symbols
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 20:16'
updated_date: '2026-10-07 20:18'
labels: []
dependencies: []
type: enhancement
ordinal: 731000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Platform Test Cluster version 20 binds six Terraform resources under infra/iac/azure. Locality assigns each 39 commits and footprint assigns each 41 commits because both use paths alone. Evidence checkout: /home/msc/Work/Docs-Architecture-Design/repos/Platform at af3964727cd52a8d929bab0995ef480aa0e307dd, origin/main d016664420a3b22e801589df6944f5c67bf1e1c3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both commands attribute symbol bindings to declaration changes without counting unrelated resources in shared files or directories.
- [ ] #2 Terraform root paths and qualified module addresses resolve nested local modules and shared definitions, including deletions and renames.
- [ ] #3 Bindings without symbols retain path attribution; unsupported or unresolved symbols label path-wide fallback.
- [ ] #4 Locality coupling and footprint use consistent attribution and retain their existing large-commit policies.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update Archboard server@TASK-448 to show history attribution through code facts.
2. Reuse code-facts adapters over historical Git bytes. Compare bound declarations before and after each non-merge commit, following file renames and local Terraform module addresses.
3. Share attribution between locality and footprint, label fallback, and use declaration overlap for coupling. Preserve existing large-commit filtering.
4. Add focused behavior tests and exercise the supplied Platform checkout. Update ADR 0045 and consumer guidance. Run the complete gate, simplify, commit code, and close the board proposal.
<!-- SECTION:PLAN:END -->
