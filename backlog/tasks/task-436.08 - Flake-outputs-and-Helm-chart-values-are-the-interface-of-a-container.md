---
id: TASK-436.08
title: Flake outputs and Helm chart values are the interface of a container
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:35'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 702000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
For a container bound to a Nix flake, a Kubernetes manifest or a compose file, the code check reports the skip `exposure-unknown`, because these have no module in the sense of code. The owner decided that the outputs of a flake and the values of a Helm chart are the interface that they expose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For a container bound to a flake, the outputs of `flake.nix` are its exposed names, and the interface findings of ADR 0044 apply to it
- [x] #2 For a container bound to a Helm chart, the values in `values.yaml` are its exposed names, and the interface findings of ADR 0044 apply to it
- [x] #3 A compose file and a plain Kubernetes manifest still give `exposure-unknown`, and an amendment of ADR 0044 records the rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is affected: the Code facts adapter/exposure rules and Code check interface responsibilities remain structurally true.
2. Treat flake.nix as a module entry file and expose its existing output facts. Add a Helm values reader selected only for charts with Chart.yaml; expose the declared dotted value paths through values.yaml.
3. Keep compose files and plain Kubernetes manifests exposure-unknown. Reuse the current module reading and findings without a separate interface model.
4. Add fast exposure and code-check fixtures proving each infrastructure interface and the unchanged unknown cases. Amend ADR 0044 and portable skill reference/coverage, run focused checks, simplify, and commit with Refs: TASK-436.08. Parent owns integrated kind/evaluation contracts and final gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented Nix output and Helm values exposure rules using the existing ModuleExposure contract. flake.nix stands for the flake directory; Chart.yaml or values.yaml stands for a chart identified by Chart.yaml. Chart-only Helm adapter records dotted key paths and YAML source spans, including nested flow mappings, never default values; malformed YAML retains a parse skip. Root values and static manifest children share normal interface ownership: external Ingress reaching a chart Service gets ENTRY_POINT_UNEXPOSED while a values child is exposed. Compose/plain Kubernetes file-bound containers retain exposure-unknown; ordinary values.yaml outside a chart retains its existing YAML/text reader. 22 focused interface/exposure tests pass; touched implementation/test lint clean. Simplification retained one exposure/finding model and reused the existing YAML span reader. Parent integrates the Definition.kind and imported Nix evaluation contracts, warning accounting and complete gate. No board structure changes; task remains In Progress until integration acceptance.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Flake outputs and Helm values define container interfaces. Compose and plain Kubernetes retain unknown exposure. Focused interface tests and the complete gate pass. ADR 0044 records the contract.
<!-- SECTION:FINAL_SUMMARY:END -->
