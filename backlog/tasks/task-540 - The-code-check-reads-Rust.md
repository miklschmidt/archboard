---
id: TASK-540
title: The code check reads Rust
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
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
