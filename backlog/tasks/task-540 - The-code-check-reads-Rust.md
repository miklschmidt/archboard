---
id: TASK-540
title: The code check reads Rust
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T19:30:00Z'
labels: []
dependencies: []
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check --code has language adapters for TypeScript, Python, C, Objective-C, Swift, C#, Nix, Terraform, Kubernetes and Compose (packages/code-intel/src/runtime/operations/code-facts, language-servers), but none for Rust. Since TASK-520 the renderer core is about 50,000 lines of Rust under crates/, and the dogfood boards bind and anchor into it: the check reads .rs files as text, matches a Rust anchor by name only, cannot tell which symbols a crate exposes, and cannot see a call between two bound Rust parts, so every board agent of TASK-520 checked Rust anchors by hand. Add a Rust adapter that follows the shape of the existing ones (definitions, exposure, module and crate resolution, and the pairs that find an undrawn relationship), with rust-analyzer as its language server where the other languages use one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An anchor on a Rust symbol resolves to its definition (function, method, type, trait, constant, module), and a missing or mismatched one is reported as for TypeScript
- [ ] #2 The check knows what a crate or module exposes (pub, pub(crate), re-exports), and a part bound to a Rust directory reads its exposure
- [ ] #3 A call or use from one bound Rust part to another that the board does not draw is reported as RELATIONSHIP_UNDRAWN, resolving use paths, crate dependencies from Cargo.toml and workspace members
- [ ] #4 Tests own the adapter on a small Rust fixture workspace, as the other languages' fixtures do, and the dogfood vault's check --code reports no Rust finding that a hand check refutes
- [ ] #5 The archboard skill and the code-check docs name Rust as a supported language and say what it needs installed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Grammar: add the upstream tree-sitter-rust 0.24.0 (MIT, tree-sitter org, ships tree-sitter-rust.wasm, ABI 14) as a pinned runtime dependency beside tree-sitter-c/python, and add it to ADR 0046's package table. BLOCKED: a new dependency needs the user's approval (ADR 0046 records the approved list).
2. Adapter code-facts/rust/: rust-adapter.ts (facts from tree + rust.scm), rust-definitions.ts (fn, impl and trait methods as Type.method, struct, enum, trait, const, static, type, mod, macro_rules), rust-exposure.ts (pub, pub(crate), pub(super), pub use re-exports, what lib.rs exposes), rust-resolution.ts (use paths with crate/self/super, renames, globs; mod in file and dir; Cargo.toml dependencies and workspace members; inModule for names the module sees). One AdapterName and one adapters.ts entry.
3. Language server: a rust row in languages.ts and CONFIGURABLE_LANGUAGES (rust-analyzer runs build scripts and proc macros, so it starts only from repo language-server configuration as sourcekit-lsp and csharp-ls do); project = nearest Cargo workspace; rust-analyzer in the flake dev shell.
4. Tests: rust-shop fixture (two crates, pub and private item, re-export, trait method, use rename, cross-crate call), code-facts/rust tests, code-check/languages/rust-check.test.ts with a stand-in and the real server as the other languages do.
5. Dogfood: archboard check --code before and after, diff by the archboard-dev method, hand-check each Rust finding added or cleared; boards: report proposed changes (vault not written by this run).
6. Docs: archboard skill references/read.md, design-checks.md, ADR 0046 table and server list.
7. Gate: bun run check, lanes one by one if it stops.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25: Stopped before implementation. Every adapter reads syntax through web-tree-sitter and a pinned npm grammar package (adapters.ts, grammars.ts, ADR 0046 'The packages'); no Rust grammar is in the dependencies. Probe: web-tree-sitter 0.27.0 loads tree-sitter-rust@0.24.0's tree-sitter-rust.wasm (ABI 14) and parses fn, impl/trait methods, use-as renames, visibility_modifier and macro_rules without errors. Rejected: @lumis-sh/wasm-rust (ADR 0046 rejects the lumis set for building from branches); a hand-written Rust parser (inconsistent with every other adapter); rust-analyzer document symbols as the syntax source (the server only resolves candidates, and a consumer without it would get nothing). Awaiting approval of tree-sitter-rust 0.24.0.

2026-10-25: Unblocked. The user approved tree-sitter-rust 0.24.0 as a pinned runtime dependency. ADR 0046's package table records it with the date. The branch was rebased onto 93762b22d before the work.

Built (commits a854705b6, 854e55c0e, 8a2506382, b898a3794, fc757b75c):

- code-facts/rust/rust-adapter.ts gives the facts from the rust.scm captures. A path is a use of each leading part (`a`, `a.b`, `a.b.c`), as TypeScript reads member chains. rust-tokens.ts reads the names in macro token trees. A `use` name that no code names, such as a trait for its methods, is a type use.
- rust-definitions.ts: items, `Type.method` for impl members, trait items, enum variants, named fields, inline `mod` prefixes, `#[macro_export]`.
- rust-imports.ts: one import per `use` leaf. `mod x;` and `extern crate` are whole-module imports. `pub use` and `pub mod` are re-exports.
- rust-cargo.ts reads Cargo.toml with Bun's TOML parser and zod: package, lib, bins, workspace members and dependencies. A path or workspace dependency is build-dependency evidence.
- rust-crates.ts: packages, crate roots, module files, and paths from `crate`, `self`, `super` and dependencies.
- rust-resolution.ts is the ImportResolver. A path that names a whole module leads to `file#*`.
- rust-exposure.ts: lib.rs, mod.rs or the file beside a module directory.
- One adapters.ts entry, one AdapterName and one ExposureRule. No new seam.
- Language server: a rust row in languages.ts (opensFiles, indexProgress `rustAnalyzer/cachePriming`). Its project is cargo-workspace.ts: the outermost Cargo.toml above the file that declares `[workspace]`, else the nearest one, else unready.
- `rust` joins CONFIGURABLE_LANGUAGES. So rust-analyzer starts only from `archboard repo language-server rust <command>`, as sourcekit-lsp and csharp-ls do. Without one, the check says language-server-missing once with that command.
- The flake dev shell gives rust-analyzer and RUST_SRC_PATH.
- Decision: no default server, because rust-analyzer runs cargo metadata, build scripts, proc macros and `cargo check`. It wrote target/flycheck0 on the dogfood run.

Evidence per criterion:

- #1: tests/runtime/operations/code-facts/rust/rust-facts.test.ts (definitions and visibility, findSymbol of `balance` and `Account.describe`). tests/runtime/operations/code-check/languages/rust-check.test.ts (ANCHOR_SYMBOL_MISSING e2, BINDING_SYMBOL_MISSING pGone, RELATIONSHIP_BACKWARDS e3).
- #2: rust-facts.test.ts (glob visibility, re-export through lib.rs), the Rust case of module-exposure.test.ts, and rust-check.test.ts (EXPOSED_UNUSED pLed, exposure-unknown only for the binary crate).
- #3: rust-check.test.ts RELATIONSHIP_UNDRAWN pLed (Cargo.toml build-dependency, path from the crate's name) and pMoney (path through a dependency's module). rust-facts.test.ts targets through a renamed import, a re-export, `crate` and `super` paths, and a workspace dependency.
- #4: the rust-shop fixture has two crates, and `cargo test --offline` passes on a copy. The stand-in mode `primes` and tests/runtime/processes/language-servers/rust-server.test.ts own the lifecycle and the unready case. The real rust-analyzer resolves `book` across crates to entry.rs:27. The dogfood check follows.
- #5: INSTALL.md (Rust section), skills/archboard/references/setup.md and authoring.md, README, check --help, docs/design/design-checks.md.

Dogfood, by the archboard-dev method (finding lines, variant prefix stripped, sorted, diffed):

- Setup: the server was restarted inside `nix develop`, so cargo, rust-analyzer and RUST_SRC_PATH are in its environment. Then `./bin/archboard repo language-server rust rust-analyzer` ran in this worktree. That writes ~/.local/state/archboard/repos.json for this checkout.
- Before the adapter: 41 findings, exit 1. `.rs` was in text-only, with 6 exposure-unknown.
- After, no server: 82 findings. 1 cleared and 42 added. The cleared one is the slab_shadow ANCHOR_SYMBOL_MISSING, added again in new wording. language-server-missing came once for rust. `.rs` left text-only, and Board layout left exposure-unknown.
- After, with rust-analyzer: the same 82. One RELATIONSHIP_UNDRAWN (SVG document from Picture key, `spelt` at key.rs:99) went from candidate information to a resolved warning. rust-analyzer took 5.7 s of the pass. A second run gave the same findings.
- The first run also gave `Item` ANCHOR_SYMBOL_MISSING (architecture.rs writes `Item::Definitions { .. }`) and `Paragraph` ANCHOR_MISMATCH (measure/mod.rs calls `Paragraph::new`). A hand check refuted both. b898a3794 fixed them (a path uses each leading part), and both cleared.

Hand verdict on every added finding:

- ANCHOR_MISMATCH `paint`, 8 times (Semantic renderer 98et92HX, uqao1YXk, j3pX4hFY, steps TZeOQrKX, 1gPGcKRA, NV6GSQ5E, and Renderer layout oYEzQ4k5, step WLZ1TpXI): true. `paint` is at archboard-scene paint/mod.rs:132, which no part binds.
- ANCHOR_MISMATCH, a definition outside both ends, 13 times, all true:
  - 0s8raCUw paint_edge_line (edge_line.rs)
  - 8sb931X2 viewer_marks (marks.rs)
  - ryvCaAp5 symbol_of (legend_symbols.rs)
  - SIdU2g2Q PaintedDrawing (archboard-scene drawing.rs)
  - t5CUCz5T paint_frame (sequence_frames.rs)
  - o1aDteuC paint_step and vHyOda5O step_ride (sequence_messages.rs)
  - 7ZIx3pOn entries_of and KLl81Vh2 mark_counts (legend_entries.rs)
  - 0i7XkljB under_title and IZLQKDye with_legend (export.rs, outside framed_for_export)
  - LxoOhChw fitted_page (page.rs)
  - mpCTSEj5 better (choosing.rs, outside placed_blocks)
- ANCHOR_MISMATCH has_regions (BaLRgz68) and reads_better_packed (mVDdGjOV): true. Both moved to blocks/choosing.rs.
- ANCHOR_MISMATCH `picture` (RSHH7EN4 and step y8dQQa2R): true, but the anchor is ambiguous. flows.rs calls sequence::picture (line 53) before flowchart::picture (line 107), and the lookup takes the first by last name in every language (lookup.ts). The board must anchor `flowchart.picture`.
- ANCHOR_MISMATCH Scene (2RYupgix) and Palette (I1lGjMES): true by the rule. Both files name the type only in signatures, which is import evidence, and the kind is data.
- ANCHOR_MISMATCH useStageAppearances (m9XkQSPd): true. The hook is in apps/web/src/ui/hooks, outside the components directory of Board viewer. It is new because the end Picture key is no longer text-only.
- ANCHOR_SYMBOL_MISSING `slab` in measured_cards.rs (sUAWU5K9): true by the rule. The file names the module only in a `use` path. The board must anchor slab_shadow or slab_seat. slab_shadow (xKJERQyv): true, architecture.rs now calls shadow_under. That finding existed before.
- RELATIONSHIP_UNDRAWN, all true:
  - Board layout from View dispatcher (MeasuredGroups, architecture.rs:84)
  - Crossing pass from View dispatcher (LineLook, appearance.rs:144)
  - Layout engines from Sequence layout (Node, through `pub use archboard_layout::Node` in board.rs)
  - Edge geometry from Flowchart (curve_through, ports.rs:184)
  - Measured text from Near and far content and Scene (measure::width and measure::face)
  - Theme palette from Subject standing marks (Palette { })
  - Near and far content from Architecture painter (Part { })
  - Subject standing marks from Near and far content (standing_palette)
  - Scene from nine painters (scene types)
  - SVG document from Picture key (spelt)
- CALLER_UNDRAWN Crossing pass (archboard-flows flowchart/mod.rs:213, LineLook): true.
- EXPOSED_UNUSED Board layout: true. InProcess is used only in a test. Laying is only a same-named enum variant in memo.rs. bridge_crossings, bridge_unfolded and unfold_crossings are used only inside archboard-layout.

Known limits, written in authoring.md: `#[path]` is not read. Code that a macro writes is not read. Macro token names are a heuristic. A name written only in a `use` path is no use. pub(crate) counts as exposed.

Unsettled: one run of the language-server test files answered `unasked` for the real rust-analyzer test, before an assertion change. Reruns of 4 and 10 times did not show it again. The test now reports why no answer came.

Gate (2026-10-25, inside `nix develop`): `bun run check` passed every lint, format, types, frontend and core lane. test:modules gave 4826 pass, 1 skip and 2 fail. The 2 failures are packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts on the boards Renderer layout (EGgs1DlZ label off its route) and Semantic renderer (aN2ABUiR along a wall), track layout. This branch changes no file under packages/renderer, crates, apps/web, packages/board or .archboard since 93762b22d, and the file fails the same way alone. So the failure comes with the boards of the base. The later lanes ran one at a time: test:system 257 pass, test:repository 144 pass, test:serial-browser 3 pass.
<!-- SECTION:NOTES:END -->
