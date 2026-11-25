---
id: TASK-646.14.01
title: Clear archboard-scene's module-depth warnings
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
ordinal: 1105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646.14, "archboard check passes on this repository again".

## What to build

The module-depth rules of TASK-646 flag this repository's own code, and the CI task `check:model` fails on any warning. This batch clears the warnings in: crates/archboard-scene. Count on feat/module-depth at a601dba760: 262 warnings: EXPOSED_VALUE 133, EXPOSED_UNUSED 114, EXPOSED_VALUE_COMPUTED 15.

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
1. Baseline: archboard check code (262 warnings: EXPOSED_VALUE 133, EXPOSED_UNUSED 114, EXPOSED_VALUE_COMPUTED 15) and render-corpus hashes before any change.
2. The Rust reader counts every pub(...) passed on by a pub mod as exposed, so crate-internal sharing moves into private root modules: sizes (the painter's and measurer's design sheet), measure (re-exported at the crate root for other crates), route, ecma (the ECMAScript helpers only the crate reads).
3. Other crates read the sheet through paint::design functions (getters, tab_width, header_words_width, header_width_for, widens_far, far_line_scale, far_line_widths, is_flow_kind, own_icons); values only one other crate read (shell geometry, landing room, EPSILON, TEXT_LINE_HEIGHT, PILL_PADDING_X) move to that crate.
4. EXPOSED_VALUE_COMPUTED: geometry::bend_radius and scene::traffic functions own the pulse math both painters repeated.
5. Prove identity: cargo test --workspace, render-corpus compare, the brief's vp lanes; rerun the check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged into refactor/module-depth-cleanup and reviewed with sol-loop (4 rounds, gpt-6.2-sol, approved). archboard check: 0 warnings on the layer; check:model exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-scene's 262 module-depth warnings (EXPOSED_VALUE 133, EXPOSED_UNUSED 114, EXPOSED_VALUE_COMPUTED 15) are 0, with no rule, waiver or ceiling touched.

What changed:
- The painter's and measurer's design sheet left paint/design.rs for a crate-private sizes module. paint/design.rs is now the door other crates use: const getters, plus functions for the math their callers repeated (tab_width, header_words_width, header_width_for, widens_far, far_line_scale, far_line_widths, is_flow_kind).
- measure, route and a new ecma module (the ECMAScript helpers only the crate reads) are private; the crate root re-exports what other crates call (width, measure_label, measure_node, measure_flow_frame, narrow_label, note_lines, message_lines, fitted_size, CardWords); geometry re-exports segment_length.
- scene::traffic keeps the pulse dimensions private and owns the math both painters wrote (pulse_tail, pulse_reach, pulse_span, with_light_room, body_stops, train_shift, turn_slide, turn_entry, turn_moment, longest_tail). geometry exposes bend_radius().
- Values one other crate alone read moved there: shell geometry and LANDING_ROOM and EPSILON to archboard-layout's constants, TEXT_LINE_HEIGHT and PILL_PADDING_X to archboard-flows' sequence design.
- Unused names went private: NoWord, word_of, Canvas and canvas_for (into paint/page), point_at, the Node and Edge aliases (into paint), PictureLegend and ViewerMarks re-exports, DOOR_FAR (behind measure's door_far_runs).

Verification: render-corpus compare, 0 of 1068 drawings differ; cargo test --workspace, 485 passed; cargo clippy --workspace --all-targets clean; vp types, lint:all, format:check, test:modules, test:repository, test:system pass, and types, lint:all, format:check, test:modules again after merging refactor/module-depth-cleanup.

Vault anchors for the orchestrator: Flowchart -> Design constants names FLOW_KIND in paint/design.rs, now flow_kind() there (the constant lives in sizes.rs); Door button -> Measured text names tab_runs in paint/door.rs, which now calls door_far_runs.
<!-- SECTION:FINAL_SUMMARY:END -->
