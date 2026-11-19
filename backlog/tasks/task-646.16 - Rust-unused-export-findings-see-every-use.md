---
id: TASK-646.16
title: Rust unused-export findings see every use
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T03:12:00Z'
updated_date: '2026-11-19T03:22:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-646.10
parent_task_id: TASK-646
type: bug
ordinal: 1102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-646, "The code check judges module depth, and agents gate on shallow modules".

## What to build

TASK-646.10 made Rust modules raise 1373 `EXPOSED_UNUSED` warnings on this repository. An audit of 25 of them (2026-11-19) found that at least a third are false: the name is used outside its module, and the check does not see the use. `EXPOSED_UNUSED` may be a warning only when the reader resolved every use (decision 6 of the spec), so the check claims a complete read that it does not have.

Failing cases from the audit (path:line at feat/module-depth c2a19febc7):

1. Used from another crate, not seen: `Group` (crates/archboard-scene/src/scene/group.rs:197) used in archboard-svg/src/groups.rs:8 and archboard-paint; `outline` (crates/archboard-text/src/outline.rs:70) used in archboard-paint/src/outlines.rs:8 and archboard-svg/src/glyphs.rs:11; `route` (crates/archboard-router/src/lib.rs:180) used in archboard-layout/src/blocks/packing/trunks.rs:6.
2. Used in the same crate but outside the module folder, not seen: `departure` (archboard-paint/src/between/departure.rs:57, module Picture motion bound to between/mod.rs) called at archboard-paint/src/flight.rs:333; `frame_of` (between/mod.rs:107) used at archboard-paint/src/stage/arrival.rs:9.
3. Called from TypeScript through wasm-bindgen: `lay_out_picture` (`js_name = layOutPicture`, crates/archboard-renderer-wasm/src/layout.rs:58), `source_hash` (lib.rs:15), `render` (render.rs:196). The model draws Diagram rendering and Layout engine calling archboard-renderer-wasm, and the warnings stay.

The full audit, with all rows: /tmp/nix-shell.KOyuFS/claude-1001/-home-msc-Projects-archboard/19a3ee13-20dc-4f34-ab5e-199cee6507ec/scratchpad/rows2.json and cc-rust.json.

Uses only in tests stay non-uses, and a name used only inside its own module stays a finding: those are correct.

## Blocked by

- TASK-646.10

## Architecture

- Proposal: "Module depth from the code", `3nkEfr1W`, in model `vKEsyHFk`.
- Slice: Code check `vKEsyHFk/HBlhIeSD#5SMX69gS` (changed by this ticket: how a Rust use resolves), Fact analysis `vKEsyHFk/6E6hL0Zk#3CaBjhIM` (changed by this ticket: Rust uses and wasm-bindgen exports). Endpoint: Module depth `vKEsyHFk#roHByn84`.
- Link: http://archboard.localhost:4242/?modelA=vKEsyHFk&stateA=3nkEfr1W&focusA=vKEsyHFk/HBlhIeSD%235SMX69gS,vKEsyHFk/6E6hL0Zk%233CaBjhIM
- Gate: before this ticket merges, `archboard model footprint --base <integration-branch> --head <ticket-branch> --state 3nkEfr1W --model-at checkout --fail-outside` exits 0. Each module in `namedAndChanged` is in this slice.

## Archboard check feedback

Follow the same section of TASK-646.05.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Rust name used from another crate of the checkout counts as used
- [ ] #2 A Rust name used from a file of its crate outside the module folder counts as used
- [ ] #3 An item exported to the host language through `#[wasm_bindgen]` counts as called by the language and gets no `EXPOSED_UNUSED`
- [ ] #4 Where a Rust use cannot be resolved, `EXPOSED_UNUSED` on that module is information, not a warning
- [ ] #5 Code-check tests reproduce each failing case of the audit
- [ ] #6 On this repository, a fresh sample of 25 Rust `EXPOSED_UNUSED` warnings has no name that a file outside its module uses, tests aside
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test-first: a code-check fixture workspace (rust-uses.test.ts) reproduces each audit case: cross-crate use through a pub use beside a same-named enum variant, a caller file defining a method of the same name, a module and function sharing a name (outline, departure), a use from outside the module folder, wasm_bindgen exports, and an unresolvable use.
2. Fact analysis, definition-site: an exact definition first, then the names imports and re-exports lead to, then a last-name match.
3. Fact analysis, Rust: a bare run-time use of a use-leaf that names a module leads to the value of that name its parent module offers (Rust's two namespaces); the reader takes a module reading's target for a use an import names.
4. Fact analysis, Rust: items under #[wasm_bindgen] are called by the language.
5. Code check: a Rust use that leads into the module but reaches no definition leaves the file unread, so EXPOSED_UNUSED there is information.
6. Measure Rust EXPOSED_UNUSED warnings before/after on this repo, audit a fresh 25-name sample.
<!-- SECTION:PLAN:END -->
