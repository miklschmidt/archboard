---
id: TASK-520.01
title: >-
  The Nix dev shell builds the renderer core to WASM, and a host refuses a stale
  build
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
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
