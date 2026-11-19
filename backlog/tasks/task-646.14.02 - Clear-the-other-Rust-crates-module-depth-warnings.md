---
id: TASK-646.14.02
title: Clear the other Rust crates' module-depth warnings
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
- [x] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [x] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [x] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code check on this checkout (ARCHBOARD_URL on a free port): the batch's warnings fell 230 -> 1 (EXPOSED_UNUSED 220 -> 0, EXPOSED_VALUE 3 -> 0, TEST_IMPORT_UNEXPOSED 5 -> 0, ANCHOR_MISMATCH 1 -> 1). The one left, archboard-render -> Legend entries, is a model error: render reaches the legend through archboard_svg::appearances, so the relationship belongs to archboard-svg; it needs a vault edit. Two anchors now need vault edits too: archboard-svg -> Viewer marks (export-marks.rs moved to crates/archboard-render/src/bin/) and Solver port -> Engine selection (the test-only InProcess solver, whose lay_out_picture call it cited, is gone).
Checker bug, outside this batch: rust-crates.ts walk() resolves archboard_svg::colour and archboard_text::shape to a same-named private module file (colour.rs, shape.rs) instead of the pub fn the crate root defines, so a used function read as EXPOSED_UNUSED. The modules were renamed css and shaping here; the resolver still needs the fix.
Renderer output: bun scripts/render-corpus.ts before (base 609f7552a1) and after: 0 of 1068 drawings differ; with --svg on --variants current --themes light, all 534 SVG documents and 534 paintings are byte-identical. Generated types.ts, the wasm-bindgen JS glue and .d.ts are identical; marks.ts differs only in its header line naming the moved program.
Tests: vp run types, lint:all, format:check, test:modules (5223 pass), test:repository (174), test:system (304), cargo test --workspace (484) pass; vendored canon and emit tests pass in a copy outside the checkout. After merging refactor/module-depth-cleanup: build, types, lint:all, format:check, test:system, test:repository pass again.

Merged into refactor/module-depth-cleanup and reviewed with sol-loop (4 rounds, gpt-6.2-sol, approved). archboard check: 0 warnings on the layer; check:model exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cleared the module-depth warnings of the renderer crates by narrowing each crate's interface to what callers outside it use. archboard-layout hides the Blocks files behind place (which now owns the solve options as nesting_option and told_drawing) and drops the test-only pair_crossings and InProcess solver. archboard-paint, render, flows and text keep their modules private and re-export their used names at the crate root; renderer-wasm shares its solve plumbing from a private module; svg's document returns its refusal as words; the export-marks program moved to archboard-render beside export-types (build-core.ts runs both by --bin); graphviz's full viz-js answer and its tests moved inside the crate; two vendored tests import items, recorded as change 7 in crates/vendor/README.md. Drawings are byte-identical across the corpus. Open: AC1 waits on three vault edits (render -> Legend entries, svg -> Viewer marks, Solver port -> Engine selection) and a checker fix for same-named module and function in Rust path resolution.
<!-- SECTION:FINAL_SUMMARY:END -->
