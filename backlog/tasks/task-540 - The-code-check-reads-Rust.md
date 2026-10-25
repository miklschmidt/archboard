---
id: TASK-540
title: The code check reads Rust
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T17:08:00Z'
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
<!-- SECTION:NOTES:END -->
