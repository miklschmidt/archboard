---
id: TASK-585
title: '`bun run check` runs `archboard check` and fails on any warning'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T17:48:00Z'
updated_date: '2026-11-06T17:50:00Z'
labels:
  - tooling
dependencies:
  - TASK-584
  - TASK-582.03
ordinal: 1029000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check is this repository's architecture linter: semantics, the code check against the bound source, and the embeds. No gate ran it, so a model that drifted from the code, or a binding a refactor broke, reached main unnoticed (for example the unbound text crate that TASK-584 found). The everyday server read its source when it started, so the gate must not check with it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `check:first` runs `archboard check` on this checkout's vault, and a warning or error fails `bun run check` locally and on CI
- [ ] #2 The check runs on a server started from this checkout's source for the run and stopped after it, never on an already running server
- [ ] #3 The gate log shows the warnings, errors, skips and timings, without the JSON result or information lines
- [ ] #4 docs/agents/test-suite.md names the stage and what it proves
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/check-model.ts runs bin/archboard check with ARCHBOARD_URL on a free loopback port, so the CLI auto-starts a server of this checkout's source, keeps stderr without information blocks, drops the JSON on stdout, stops that server, and exits with the check's status.
2. vite.config.ts: task check:model (depends on contracts and core, uncached) joins check:first; the concurrency limit becomes 13.
3. docs/agents/test-suite.md names the stage.
4. The stack puts this layer above TASK-582.03, which brings the 83 containment warnings to zero, so the gate lands green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured: check:model takes about 26 s beside the other stages; its server stops after the run (server process count unchanged). It fails today on the 83 containment warnings only, which TASK-582.03 repairs in the layer below. lint:policy and format:check pass.
<!-- SECTION:NOTES:END -->
