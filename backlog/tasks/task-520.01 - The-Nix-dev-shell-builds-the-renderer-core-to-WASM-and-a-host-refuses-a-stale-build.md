---
id: TASK-520.01
title: >-
  The Nix dev shell builds the renderer core to WASM, and a host refuses a stale
  build
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-24 12:53'
updated_date: '2026-10-24 13:24'
labels:
  - renderer
  - tooling
dependencies: []
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-paint-list.md
parent_task_id: TASK-520
priority: high
ordinal: 921000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every later step of TASK-520 needs Rust code that Bun and the browser load. ADR 0014 removed the build step because a compiled copy can be stale with no symptom, and a WASM build brings a compiled copy back, so the host must notice a stale build instead of running it. The user chose a Nix flake and dev shell for the tools (2026-10-24). A fresh worktree must still work after bun install and the documented build commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `nix develop` gives cargo, the wasm32-unknown-unknown target, a wasm-bindgen CLI of the same version as the crate's wasm-bindgen dependency, and Bun
- [ ] #2 One bun script builds the core to WASM from a Cargo workspace whose crates live in packages/renderer, and the build output is ignored by Git
- [ ] #3 The renderer package loads the core under Bun and in a browser worker from the same WASM file, and a test calls the core in each place
- [ ] #4 A host refuses a build whose recorded source hash differs from the core sources in its checkout, and the refusal names the build command
- [ ] #5 CI runs the complete gate inside the Nix dev shell
- [ ] #6 ADR 0014, INSTALL.md, TESTING.md and the agent rules say how to build the core
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. flake.nix: nixpkgs cargo, rustc, rustfmt, clippy, lld and wasm-bindgen-cli; Bun pinned to 1.4.3 from its release archives, because nixpkgs has 1.4.2.
2. Root Cargo workspace with members packages/renderer/crates/*; crate archboard-renderer-wasm pins wasm-bindgen =0.2.129 and answers sourceHash().
3. scripts/build-core.ts: keeps a build that records the hash of the current sources, else cargo build for wasm32 with ARCHBOARD_CORE_SOURCE_HASH and wasm-bindgen --target web into packages/renderer/src/shared/protocol/generated/core (ignored like the Codex bindings).
4. @archboard/renderer/core: coreSourceHash() and loadCore(), which refuses CORE_BUILD_MISSING and CORE_BUILD_STALE with the build command.
5. Both layout workers load the core before loadLayoutEngine, which must capture only the Graphviz and libavoid memories.
6. build:frontend, dev:frontend, lint and type-check run build:core first; lint:core runs clippy; fmt runs cargo fmt.
7. CI runs install and the gate inside nix develop.
8. ADR 0014 amendment, ADR 0057 workspace sentence, INSTALL.md, TESTING.md, AGENTS.md and the agent rules.
Board proposal: Semantic renderer@TASK-520.01 (Renderer core, Core loader, Bun layout worker, Browser layout worker).
<!-- SECTION:PLAN:END -->
