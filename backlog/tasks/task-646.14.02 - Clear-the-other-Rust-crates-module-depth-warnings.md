---
id: TASK-646.14.02
title: Clear the other Rust crates' module-depth warnings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T09:58:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-646.14
type: task
ordinal: 1106000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646.14, "archboard check passes on this repository again".

## What to build

The module-depth rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This batch clears the warnings in: crates/archboard-layout, crates/archboard-paint, crates/archboard-render, crates/archboard-text, crates/archboard-flows, crates/archboard-svg, crates/archboard-renderer-wasm, crates/archboard-graphviz, and the two TEST_IMPORT_UNEXPOSED warnings under crates/vendor. Count on feat/module-depth at a601dba760: about 230 warnings, mostly EXPOSED_UNUSED (archboard-layout 146, archboard-paint 53).

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
1. List the batch's warnings with archboard check code (230 at the start: 220 EXPOSED_UNUSED, 3 EXPOSED_VALUE, 5 TEST_IMPORT_UNEXPOSED, 1 ANCHOR_MISMATCH).
2. Block layout: make every submodule of crates/archboard-layout/src/blocks private except place; move the solve-option protocol (BLOCKS_*) behind place functions; delete the test-only pair_crossings.
3. archboard-layout: remove the test-only InProcess solver; tests carry their own solver.
4. archboard-paint, render, flows, text, svg, renderer-wasm, graphviz: narrow pub to what callers outside use; move test helpers that cross module files into the module or its entry.
5. Prove the renderer output identical: cargo tests, render-corpus hashes before and after.
6. Report the anchors and relationships that need a vault edit (ANCHOR_MISMATCH render -> Legend entries is a vault change).
<!-- SECTION:PLAN:END -->
