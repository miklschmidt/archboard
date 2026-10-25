---
id: TASK-520.01
title: >-
  The Nix dev shell builds the renderer core to WASM, and a host refuses a stale
  build
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T20:25:00Z'
labels:
  - renderer
  - tooling
dependencies: []
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
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
- [x] #1 `nix develop` gives cargo, the wasm32-unknown-unknown target, a wasm-bindgen CLI of the same version as the crate's wasm-bindgen dependency, and Bun
- [x] #2 One bun script builds the core to WASM from a Cargo workspace whose crates live in packages/renderer, and the build output is ignored by Git
- [x] #3 The renderer package loads the core under Bun and in a browser worker from the same WASM file, and a test calls the core in each place
- [x] #4 A host refuses a build whose recorded source hash differs from the core sources in its checkout, and the refusal names the build command
- [x] #5 CI runs the complete gate inside the Nix dev shell
- [x] #6 ADR 0014, INSTALL.md, TESTING.md and the agent rules say how to build the core
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. flake.nix: nixpkgs cargo, rustc, rustfmt, clippy, lld and wasm-bindgen-cli; Bun pinned to 1.4.3 from its release archives, because nixpkgs has 1.4.2.
2. Root Cargo workspace with members crates/*; crate archboard-renderer-wasm pins wasm-bindgen =0.2.129 and answers sourceHash().
3. scripts/build-core.ts: keeps a build that records the hash of the current sources, else cargo build for wasm32 with ARCHBOARD_CORE_SOURCE_HASH and wasm-bindgen --target web into packages/renderer/src/shared/protocol/generated/core (ignored like the Codex bindings).
4. @archboard/renderer/core: coreSourceHash() and loadCore(), which refuses CORE_BUILD_MISSING and CORE_BUILD_STALE with the build command.
5. Both layout workers load the core before loadLayoutEngine, which must capture only the Graphviz and libavoid memories.
6. build:frontend, dev:frontend, lint and type-check run build:core first; lint:core runs clippy; fmt runs cargo fmt.
7. CI runs install and the gate inside nix develop.
8. ADR 0014 amendment, ADR 0057 workspace sentence, INSTALL.md, TESTING.md, AGENTS.md and the agent rules.
Board proposal: Semantic renderer@TASK-520.01 (Renderer core, Core loader, Bun layout worker, Browser layout worker).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification, 2026-10-24:
- nix develop gives Bun 1.4.3, cargo and rustc 1.99.0, lld and wasm-bindgen 0.2.129; the crate pins wasm-bindgen =0.2.129. nixpkgs Rust builds wasm32-unknown-unknown without an overlay, but links it with lld, so the shell carries lld.
- bun run build:core builds crates/archboard-renderer-wasm into packages/renderer/src/shared/protocol/generated/core (ignored, like the Codex bindings; git check-ignore confirms it and /target/). A second run keeps the build without cargo.
- Bun: packages/renderer/tests/runtime/services/core.test.ts loads the build and reads its hash, and holds the CORE_BUILD_STALE refusal. A stale core (a changed Rust comment) made scripts/engine-gallery.ts fail with the refusal, which names bun run build:core.
- Browser: the first browser run failed: loadLayoutEngine counts the WebAssembly memories made during its load and expects exactly Graphviz and libavoid. Both workers now load the core before the engine. The browser lane then passed, with pictures drawn in the tab by workers that initialize the core.
- The core load costs about 1.3 ms per worker (0.24 ms hash, 1.1 ms instantiate).
- Gate: bun run check inside nix develop passed to the end on the third run. Run 1 failed tests/system/repository-policy/package-api.test.ts, which parsed the generated .d.ts glue: productionFiles now skips the generated trees that the same file already skips elsewhere. Run 2 failed wide-boards.test.ts by 10 ms over its 3000 ms first-layout bound under load. It passed three times alone and in runs 1 and 3, so no repair task.
- Board: Semantic renderer@TASK-520.01 adopted at version 83. archboard check --code showed no finding added by the proposal. The footprint against 1c6759c19 named all four new parts as changed and nothing changed but unnamed. The vault check then flagged Browser application -> Browser layout worker as drawn by nesting already, so that relationship was removed (version 84). The Archboard board is behind on packages/renderer, but it draws packages and their layers, and the crates and the loader live inside the renderer package, so it stays right. The Rust file of Renderer core has no code-facts adapter, so the check reads it as text.
- Not verified: criterion 5. .github/workflows/ci.yml installs Nix and runs install and the gate inside nix develop, but no CI run has happened, because nothing was pushed.

Restructure after review, 2026-10-24: the crate moved to crates/archboard-renderer-wasm, with the root workspace members crates/*. The dev shell now reads Bun from package.json packageManager and the wasm-bindgen CLI from Cargo.lock (nixpkgs carries one package per version, wasm-bindgen-cli_0_2_N). A lock set to 0.2.128 gave wasm-bindgen-cli-0.2.128, and one set to 0.2.999 stopped evaluation with a message naming the fix. The board correction was adopted as "TASK-520.01 crates" (version 87), and bun run check passed to the end inside nix develop.

AC5 proven on pull request #14, CI run 40229337618 at a853b85a5: the job 'Complete validation gate' installs Nix (cachix/install-nix-action), runs 'nix develop --command bun install --frozen-lockfile' and 'nix develop --command bash -o pipefail -c bun run check ...'. It compiled the core from the crates with 0 of 16 task cache hits, and all 19 gate tasks succeeded, the Rust lanes and tests/native.rs included. The macOS job also builds the core in the dev shell and passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Nix flake's dev shell gives cargo, the wasm32 target, a matching wasm-bindgen CLI and Bun; bun run build:core builds the core to WASM with Git ignoring the output; Bun and the browser load the same file and refuse a build whose source hash differs from their checkout, naming the build command; CI runs install and the complete gate inside nix develop. Risk: every contributor and CI job now needs Nix to build the core.
<!-- SECTION:FINAL_SUMMARY:END -->
