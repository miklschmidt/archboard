---
id: TASK-646.18
title: External modules get no verdicts, and an undeclared interface shows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T04:22:00Z'
updated_date: '2026-11-19T04:34:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.17
parent_task_id: TASK-646
type: bug
ordinal: 1104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

Three gaps found while auditing the findings on this repository (2026-11-19):

1. Modules of kind `external` are outside what the repository owns, yet Module depth judges them. About 1000 of the 1343 Rust `EXPOSED_UNUSED` warnings sit on vendored crates the model marks external (`graphviz-pure-*` and `vello_encoding` under crates/vendor). Nobody here should refactor their interface.
2. After TASK-646.17, a folder module with no declared interface (no entry file, no package.json exports) lets sibling use count as use. The owner wants what that leaves out to stay visible: how many of its names files outside the folder use.
3. Rust types exported to TypeScript through `#[derive(TS)]` (ts-rs, written by crates/archboard-render/src/bin/export-types.rs through scripts/build-core.ts) are judged as unused Rust exports: about 20 warnings. TASK-646.16 already treats `#[wasm_bindgen]` items as called by the language.

## Blocked by

- TASK-646.17, because both change Module depth.

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Module depth `vKEsyHFk#roHByn84` (changed by this ticket). Endpoints: Code check `vKEsyHFk/HBlhIeSD#5SMX69gS`, Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk%23roHByn84
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

Follow the same section of TASK-646.05.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A module of kind external keeps its counts but gets no per-name finding and no MODULE_SHALLOW
- [ ] #2 A folder module with no declared interface gets one information finding that says how many of its names files outside the folder use, and Measures shows it
- [ ] #3 A Rust item that derives ts-rs `TS` counts as used by the host language and gets no EXPOSED_UNUSED
- [ ] #4 The archboard skill and ADR 0082 describe all three
- [ ] #5 Code-check tests cover each case
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tests first: module-depth-names fixture gains an external module (kind external) with an unused and a pass-through export -> counts kept, no per-name finding, no MODULE_SHALLOW; Ledger (index-less folder) gets one INTERFACE_UNDECLARED information finding naming how many of its names files outside use and which only its own files import; rust-uses fixture gains #[derive(TS)] / #[derive(ts_rs::TS)] items -> no EXPOSED_UNUSED.
2. Module depth: DepthReading.external (the code check sets it from the node's or a holder's kind); moduleDepth counts and lists, judges nothing for it. The code check's unjudged-language EXPOSED_UNUSED skips it too.
3. Module depth: INTERFACE_UNDECLARED, information, on a module that declares no interface where at least one name is kept used only by a sibling import (so Go/Swift and modules with nothing left out stay quiet).
4. Fact analysis: rust-definitions marks an item under #[derive(..TS..)] calledByLanguage, like #[wasm_bindgen].
5. UI: Measures' Code tab names the finding (FINDING_NAMES); the About page's code exports show it over the list beside MODULE_SHALLOW. Screenshots in both themes.
6. Docs: ADR 0082, design lens, CLI check help, CONTEXT.md if a term is new.
7. Before/after warning totals by code on this repository with bin/archboard.
<!-- SECTION:PLAN:END -->
