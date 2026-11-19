---
id: TASK-646.14.01
title: Clear archboard-scene's module-depth warnings
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T06:02:00Z'
updated_date: '2026-11-19T06:13:00Z'
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
- [ ] #1 `archboard check code` reports no warning on a module bound under this batch's paths
- [ ] #2 No lint, type, test or check rule, policy, waiver or exemption is weakened or added to pass
- [ ] #3 Behavior is unchanged: the existing tests of the touched packages pass, and renderer output is identical where a crate draws
- [ ] #4 Each removed or renamed symbol that a vault anchor names is reported with its replacement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: archboard check code (262 warnings: EXPOSED_VALUE 133, EXPOSED_UNUSED 114, EXPOSED_VALUE_COMPUTED 15) and render-corpus hashes before any change.
2. EXPOSED_UNUSED: stop exporting names no outside code uses; the Rust reader counts every pub(...) in a pub mod chain as exposed, so in-crate-only names move out of pub modules' root files or become private.
3. paint::design: constants only the measurer reads move into measure; constants only one other crate reads (shell geometry, sequence-only sizes) move to that reader; the rest stay private to the painter and the outside reads them through const getters or through functions that own the repeated math (tab shoulder, header padding, far scale, card padding).
4. EXPOSED_VALUE_COMPUTED: give geometry (BEND_RADIUS), scene::traffic (PULSE_*) and design functions for the math callers repeat; callers call them.
5. Prove identity: cargo test --workspace, render-corpus compare (all hashes equal), the brief's vp lanes; rerun the check to show 0 warnings in the batch.
<!-- SECTION:PLAN:END -->
