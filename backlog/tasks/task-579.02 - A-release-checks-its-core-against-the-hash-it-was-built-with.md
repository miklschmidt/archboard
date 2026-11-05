---
id: TASK-579.02
title: A release checks its core against the hash it was built with
status: Done
assignee:
  - '@claude'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:33:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/renderer/src/runtime/services/core.ts
  - packages/renderer/src/runtime/store/core-sources.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1023000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release ships no `crates/`, so `coreSourceHash()` cannot run and would throw. The core must still be refused when its bytes do not match what the release recorded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In release mode the core loads when its recorded hash equals `coreSourceHash` in `archboard-release.json`, without reading any Rust source
- [x] #2 A core whose hash differs is refused with `CORE_BUILD_STALE`, and the remedy names reinstalling, not `bun run build:core`
- [x] #3 Checkout mode keeps the source-hash refusal
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. core.ts: take the core directory and the expected hash from installation() (coreDirectory; sources hash in a checkout, marker hash in a release); release remedy is to reinstall. 2. core-sources.ts keeps only checkout facts (no CORE_WASM). 3. Tests: release fixture with marker for match, stale and interrupted; checkout stale keeps build:core remedy. 4. Docs: boundaries note renderer imports workspace.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
core.ts takes coreDirectory and the expected hash from installation(); a release compares against its marker hash and never calls coreSourceHash, so it reads no Rust source. loadCore(expected?, from = installation()) keeps build-core.ts's loadCore(hash) call unchanged. The remedy is a reinstall in release mode, bun run build:core in a checkout. The compiled-module cache is keyed by core directory. CORE_WASM left core-sources.ts (only core.ts used it). Renderer now imports workspace (docs/agents/boundaries.md updated). For TASK-579.08: the generated glue imports #shared/rules/render/core-guard.ts through the renderer's package imports, so the release build must bundle or inline that guard into core/archboard_renderer_wasm.js. Pre-existing failure, also on the base checkout: renderer wide-pictures.test.ts blocks jeDfgVfS (labels over their own line).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
core.ts loads the glue and WebAssembly from installation().coreDirectory and expects the marker hash in a release, coreSourceHash(root) in a checkout. CORE_BUILD_MISSING/INVALID/STALE name reinstalling in a release and `bun run build:core` in a checkout. Verified on fix/core-build-feedback after merge: packages/renderer tests/runtime/services/core.test.ts 6 pass (release fixture without crates/, stale-hash refusal with reinstall remedy, checkout refusal and load). Follow-up for TASK-579.08: the generated glue imports `#shared/rules/render/core-guard.ts`, so the release build must bundle the guard into core/. The benchmark wide-pictures.test.ts fails on this branch and at b769329e1 alike (outside the check gate, unrelated).
<!-- SECTION:FINAL_SUMMARY:END -->
