---
id: TASK-579.02
title: A release checks its core against the hash it was built with
status: To Do
assignee: []
created_date: '2026-11-05T14:58:00Z'
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
- [ ] #1 In release mode the core loads when its recorded hash equals `coreSourceHash` in `archboard-release.json`, without reading any Rust source
- [ ] #2 A core whose hash differs is refused with `CORE_BUILD_STALE`, and the remedy names reinstalling, not `bun run build:core`
- [ ] #3 Checkout mode keeps the source-hash refusal
<!-- AC:END -->
