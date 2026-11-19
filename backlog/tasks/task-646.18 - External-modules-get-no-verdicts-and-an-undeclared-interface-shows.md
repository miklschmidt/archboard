---
id: TASK-646.18
title: External modules get no verdicts, and an undeclared interface shows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T04:22:00Z'
updated_date: '2026-11-19T04:49:00Z'
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
- [x] #1 A module of kind external keeps its counts but gets no per-name finding and no MODULE_SHALLOW
- [x] #2 A folder module with no declared interface gets one information finding that says how many of its names files outside the folder use, and Measures shows it
- [x] #3 A Rust item that derives ts-rs `TS` counts as used by the host language and gets no EXPOSED_UNUSED
- [x] #4 The archboard skill and ADR 0082 describe all three
- [x] #5 Code-check tests cover each case
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
INTERFACE_UNDECLARED fires only when at least one name is kept used by a sibling import, so a Go or Swift package (whose files see each other without imports) and a module with nothing left out stay quiet. It names the first five such names, and then 'and N more': the first run listed all 81 names of Epoch ledger, a wall of text in Measures.
External: the code check marks a module external when its part or any part that holds it has kind external; Module depth then counts and lists its exports and returns no finding. The code check's own unjudged-language EXPOSED_UNUSED skips it too.
On this repository (archboard check code, current state, before merging the integration tip): warnings EXPOSED_UNUSED 1480 -> 472, EXPOSED_VALUE 396 -> 358, EXPOSED_VALUE_COMPUTED 24 -> 23, REEXPORT_PASS_THROUGH 5 -> 1, ANCHOR_MISMATCH 1 -> 1, TEST_IMPORT_UNEXPOSED 5 -> 5. Information: CODE_PASS_THROUGH 53 -> 31, REEXPORT_PASS_THROUGH 68 -> 4, INTERFACE_UNDECLARED 0 -> 37, others unchanged. Every cleared finding is on an external module (graphviz-pure-*, Graphviz, vello_encoding) or is a ts-rs type (archboard-scene 14, archboard-render 3, Scene 2). The only new findings are the 37 INTERFACE_UNDECLARED.
UI: Measures, tab 'Where the map and the code disagree', shows each INTERFACE_UNDECLARED card with the chip 'Undeclared interface' (checked in both themes with agent-browser against this checkout's server). A module's code exports on About show it over the list, beside MODULE_SHALLOW.
Footprint (--fail-outside) exits 1: namedAndChanged = Code check, Code exports, Fact analysis, Module depth; changed outside the draft = Commands (check-help text), code-intel (tests), Model reading (finding chip name). check code --fail-shallow-modules --base feat/module-depth: no MODULE_SHALLOW on a touched module; it exits 1 on the older warnings TASK-646.14 clears.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
External modules get no verdicts, a folder module with no declared interface shows what sibling use leaves out, and ts-rs types count as used (decision 17).

What changed:
- Code check (interfaces.ts, judged-module.ts): a part whose kind, or a holder's kind, is external marks its module external. Module depth counts and lists its exports and gives no finding; the unjudged-language EXPOSED_UNUSED skips it too.
- Module depth: moduleDepth splits judging into depthFindings, skipped for external modules. sibling-uses.ts gains userOf (outside, sibling or none, shared with EXPOSED_UNUSED) and INTERFACE_UNDECLARED, information, on a module that declares no interface where at least one name is used only by its own files: how many of its names files outside it use, how many only its own files import, and the first five of those.
- Fact analysis (rust-definitions.ts): an item under #[derive(..TS..)] or #[derive(ts_rs::TS)] is calledByLanguage, as #[wasm_bindgen] is.
- Web: the finding chip reads 'Undeclared interface' in Measures; the About code exports show it over the list beside MODULE_SHALLOW.
- Docs: ADR 0082, design lens, CONTEXT.md (Undeclared interface), CLI check help, protocol comment.

Verification: module-depth-names (external module keeps counts, no depth finding; Ledger gets one INTERFACE_UNDECLARED with 1 of 4 and freeze), rust-uses (derive TS and ts_rs::TS -> no EXPOSED_UNUSED), c-check (src without include/ gets INTERFACE_UNDECLARED). After merging feat/module-depth: test:modules 5213 pass, types, lint, format clean. Measures checked in both themes in the running app.

On this repository: EXPOSED_UNUSED warnings 1480 -> 472, EXPOSED_VALUE 396 -> 358, EXPOSED_VALUE_COMPUTED 24 -> 23, REEXPORT_PASS_THROUGH 5 -> 1; all cleared findings are on external modules or ts-rs types.

Surfaced on modules this ticket does not change: INTERFACE_UNDECLARED information on 37 modules.

Risks / follow-ups: footprint exits 1 on Commands (help text), code-intel (tests) and Model reading (chip name), plus Code exports among namedAndChanged outside the Module depth slice.
<!-- SECTION:FINAL_SUMMARY:END -->
