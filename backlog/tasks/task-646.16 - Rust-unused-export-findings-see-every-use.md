---
id: TASK-646.16
title: Rust unused-export findings see every use
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T03:12:00Z'
updated_date: '2026-11-19T03:42:00Z'
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
- [x] #1 A Rust name used from another crate of the checkout counts as used
- [x] #2 A Rust name used from a file of its crate outside the module folder counts as used
- [x] #3 An item exported to the host language through `#[wasm_bindgen]` counts as called by the language and gets no `EXPOSED_UNUSED`
- [x] #4 Where a Rust use cannot be resolved, `EXPOSED_UNUSED` on that module is information, not a warning
- [x] #5 Code-check tests reproduce each failing case of the audit
- [x] #6 On this repository, a fresh sample of 25 Rust `EXPOSED_UNUSED` warnings has no name that a file outside its module uses, tests aside
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test-first: rust-uses.test.ts, a code-check fixture workspace, reproduces each audit case.
2. Fact analysis, definition-site: a definition spelled as the symbol first, then where imports and re-exports lead, then a member that only ends with the name.
3. Fact analysis, Rust: a value written alone through a use leaf that names a module reaches the value the module above offers; the cached fact reader takes a module reading's target for a use an import names.
4. Fact analysis, Rust: #[wasm_bindgen] items and impl members are calledByLanguage; Module depth never judges such a name unused.
5. Code check: a Rust use that leads into the module's own files and reaches no definition leaves the file unread (information); a path to a crate root reaches a #[macro_export] macro.
6. Measure before/after on this repository and audit a fresh sample of 25.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured with this checkout's CLI (bin/archboard check code, own server): Rust EXPOSED_UNUSED warnings 1373 -> 1343, none turned to information. Fresh sample of 25 (seed 1119): 0 names used by a file outside their module, tests aside; the 7 grep hits were other items of the same name (RNode, PictureLegend in archboard-svg and TS, Projection, title_of/titleOf, hypot, normalize, inset_of/insetOf) or uses inside the module (between.phase, used only inside the archboard-paint crate). 20 of the remaining warnings are #[derive(TS)] types; TypeScript names only LegendLayout of them directly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rust EXPOSED_UNUSED now sees the uses the audit found missing: 1373 warnings -> 1343 on this repository, and a fresh sample of 25 has no name a file outside its module uses.

What changed:
- Fact analysis (definition-site.ts): a definition spelled as the symbol comes first, then where the file's imports and re-exports lead, and a member whose last names match only after both. Before, the variant Item::Group hid the re-exported struct Group, and a caller's own method route hid router::route.
- Fact analysis (rust-resolution.ts): a value written alone through a use leaf that names a module (use text::outline; outline(..)) reaches the value the module above offers (mod outline; pub use outline::outline;), as Rust's namespaces say. Fixes outline and departure.
- Cached fact reader (reader.ts, outside the slice): a target the module reading gives a use wins over the import's, so the Rust resolver can answer for uses an import names. Other adapters give none there; test:modules passes.
- Fact analysis (rust-definitions.ts): an item, or a member of an impl block, under #[wasm_bindgen] is calledByLanguage. Module depth (name-findings.ts, outside the slice): such a name is never judged unused, like a method or a static member.
- Code check (module-reading.ts): a Rust use that leads into the module's own files and reaches no definition, as a function a macro defines, leaves the file unread, so EXPOSED_UNUSED is information. A path to a crate root reaches a #[macro_export] macro of the crate, wherever it is defined. Private test-import helpers moved to test-imports.ts to keep the file under 600 lines.
- Design lens: both Rust rules.

Verification: rust-uses.test.ts (cross-crate use past a same-named variant and caller method, module/function namesakes across crates and outside the module folder, exported macro, wasm_bindgen, macro-made name -> information); test:modules 5174 pass; types and lint clean.

Surfaced on modules this ticket does not change: ANCHOR_MISMATCH warning on 1 relationship (archboard-render -> Legend entries): its anchor appearances used to match the struct field RenderedPicture.appearances by its last name and now resolves to the call archboard_svg::appearances, which neither end binds. EXPOSED_UNUSED warnings went down on Scene, Picture motion, archboard-renderer-wasm, archboard-router, archboard-scene, archboard-text and graphviz-pure-core; no new ones.

Risks / follow-ups: types exported to TypeScript through #[derive(TS)] are still judged (20 warnings; only LegendLayout is named by TS code). Footprint exits 1: Module depth and Cached fact reader changed outside the slice, code-intel by its tests.
<!-- SECTION:FINAL_SUMMARY:END -->
