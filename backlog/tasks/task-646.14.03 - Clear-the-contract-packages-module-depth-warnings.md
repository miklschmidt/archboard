---
id: TASK-646.14.03
title: Clear the contract packages' module-depth warnings
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T12:35:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646.14
type: task
ordinal: 1107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646.14, "archboard check passes on this repository again".

## What to build

The module-depth rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This batch clears the warnings in: packages/model, packages/code-binding, packages/code-intel, packages/workspace, packages/diagnostics. Count on feat/module-depth at a601dba760: 75 warnings, mostly EXPOSED_VALUE on zod schemas (decision 14: a schema is a value; hide it behind a function such as a parse function and export the derived types).

Clear each finding with the seam the archboard skill names for it (skills/archboard/references/design-lens.md): move a value to its only reader, move the behavior that callers repeat into the module as a function, export a getter where a caller needs the value itself, stop exporting a name nothing outside uses (Rust: narrow `pub` to `pub(crate)` or private), and keep one door per name. The full check output: /tmp/nix-shell.KOyuFS/claude-1001/-home-msc-Projects-archboard/19a3ee13-20dc-4f34-ab5e-199cee6507ec/scratchpad/cc-final.json.

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: the modules bound under this batch's paths. The refactor changes code interfaces, not the model's relationships; a change that does alter a relationship, or a removed or renamed symbol that a vault anchor names, is reported to the orchestrator, who edits the vault.
- Gate: merge-time footprint as for every TASK-646 ticket; changes without architectural meaning are recorded exceptions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard check code` reports no warning on a module bound under this batch's paths
- [x] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [x] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [x] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Hide each flagged value of packages/model, code-binding, code-intel, workspace and diagnostics behind a getter function in its defining private file (decision 14: a schema is a value; owner: a getter is a fine narrow interface). Callers compose schemas (.extend, .shape, .options, z.array, framework arguments), so a parse function alone cannot serve them.
2. api files re-export the getter in place of the value, one for one, so interface widths stay at their ceilings.
3. Callers outside each package call the getter; type positions read ReturnType<typeof getter> or an already exported derived type. Keep caller edits mechanical and small.
4. Constants (logger, DEFAULT_ARCHBOARD_URL, VAULT_DIRECTORY, VAULT_ORIGINS, CONFIGURABLE_LANGUAGES, DEFAULT_TRAFFIC_SPEED, SEMANTIC_PANE_CONTEXT_ROUTE, DEFAULT_SEMANTIC_POLICY, EVERYTHING_VIEW, DEFAULT_LAYOUT_ENGINE, PictureReceiptShape) get getters the same way.
5. Run types, lint:all, format:check, test:modules, test:repository, test:system; merge the cleanup tip; rerun archboard check code for the batch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: bin/archboard check code on 3ec3b0fe7e reports 0 warnings on the modules bound under packages/model, code-binding, code-intel, workspace and diagnostics (75 EXPOSED_VALUE before). types, lint:all, format:check, test:modules (5223 pass), test:repository (174 pass) and test:system (304 pass) pass. Interface widths stay at their ceilings: each getter replaces its value one for one. No rule, ceiling, waiver or vault file changed. Renderer output: site drawings re-rendered with identical geometry (only freshly minted example ids differ), and no crate changed.
Anchors that name a renamed symbol in a caller file (the check reports 7 ANCHOR_SYMBOL_MISSING until the vault follows):
- Authored role instructions -> Pane context protocol: SemanticSubjectKindSchema -> semanticSubjectKindSchema (packages/workbench/src/runtime/instructions/rules/context.ts)
- Canonical model routes -> Model contract: ArchitectureCheckpointRequestSchema -> architectureCheckpointRequestSchema (apps/server/src/server/http/handlers/reads/routes/model-routes.ts)
- Code opener -> Binding contract: CodeBindingSchema -> codeBindingSchema (packages/code-opener/src/server/projections/github-link.ts)
- Contract definition -> Source checkout: DEFAULT_ARCHBOARD_URL -> defaultArchboardUrl (apps/cli/src/cli/contract/protocol/shared-options.ts)
- Legacy board schema -> Binding contract: CodeBindingSchema -> codeBindingSchema (packages/model/src/shared/schemas/content.ts)
- Migration routes -> Migration planning contracts: LegacyMappingWriteSchema -> legacyMappingWriteSchema (apps/server/src/server/http/handlers/reads/routes/migration-routes.ts)
- Model contract -> Binding contract: CodeBindingSchema -> codeBindingSchema (packages/model/src/shared/canonical-contracts/schemas/model.ts)
Anchors that cite a schema at its definition stay valid: each private file keeps its const under the old name.

Merged into refactor/module-depth-cleanup and reviewed with sol-loop (4 rounds, gpt-6.2-sol, approved). archboard check: 0 warnings on the layer; check:model exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every flagged exported value of the contract packages now hides behind a getter in the private file that defines it, and each api file re-exports the getter in place of the value. Callers compose these schemas (.extend, .shape, .options, z.array, command and route specs), so a parse function alone could not serve them; the owner accepts a getter as a narrow interface. Constants got the same treatment (logger(), defaultArchboardUrl(), vaultDirectory(), vaultOrigins(), configurableLanguages(), defaultLayoutEngine(), defaultSemanticPolicy(), defaultTrafficSpeed(), everythingView(), semanticPaneContextRoute(), pictureReceiptShape()). Callers in other packages changed only by the mechanical rename: XSchema -> xSchema(), typeof XSchema -> ReturnType<typeof xSchema>, logger.level -> logger().level. Batch warnings 75 -> 0; all validation lanes pass. Follow-up for the orchestrator: 7 vault anchors name renamed symbols in caller files (listed in notes). Possible later step: export derived types such as SemanticPaneContext in place of ReturnType spellings, once a package has width to spare.
<!-- SECTION:FINAL_SUMMARY:END -->
