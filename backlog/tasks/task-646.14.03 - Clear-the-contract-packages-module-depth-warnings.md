---
id: TASK-646.14.03
title: Clear the contract packages' module-depth warnings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T06:07:00Z'
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
- [ ] #1 `archboard check code` reports no warning on a module bound under this batch's paths
- [ ] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [ ] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [ ] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Hide each flagged value of packages/model, code-binding, code-intel, workspace and diagnostics behind a getter function in its defining private file (decision 14: a schema is a value; owner: a getter is a fine narrow interface). Callers compose schemas (.extend, .shape, .options, z.array, framework arguments), so a parse function alone cannot serve them.
2. api files re-export the getter in place of the value, one for one, so interface widths stay at their ceilings.
3. Callers outside each package call the getter; type positions read ReturnType<typeof getter> or an already exported derived type. Keep caller edits mechanical and small.
4. Constants (logger, DEFAULT_ARCHBOARD_URL, VAULT_DIRECTORY, VAULT_ORIGINS, CONFIGURABLE_LANGUAGES, DEFAULT_TRAFFIC_SPEED, SEMANTIC_PANE_CONTEXT_ROUTE, DEFAULT_SEMANTIC_POLICY, EVERYTHING_VIEW, DEFAULT_LAYOUT_ENGINE, PictureReceiptShape) get getters the same way.
5. Run types, lint:all, format:check, test:modules, test:repository, test:system; merge the cleanup tip; rerun archboard check code for the batch.
<!-- SECTION:PLAN:END -->
