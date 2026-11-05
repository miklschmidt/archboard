---
id: TASK-579.08
title: bun run release builds the launchers and the three platform packages
status: To Do
assignee: []
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T15:15:00Z'
labels: []
dependencies:
  - TASK-579.02
  - TASK-579.03
  - TASK-579.04
  - TASK-579.06
  - TASK-579.07
  - TASK-579.12
references:
  - vite.config.ts
  - scripts/build-core.ts
  - scripts/pack-codex-realtime-voice.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1029000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The packages of ADR 0075 must come from one reproducible command that CI and a maintainer run the same way.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bun run release` writes `@archboard/cli` and `archboard` launchers and `@archboard/cli-{linux-x64,linux-arm64,darwin-arm64}` into `dist/release`
- [ ] #2 Each platform package holds the executable, frontend, core, grammars, skills, `archboard-release.json`, a LICENSE that names the version, and third-party notices for every bundled dependency and font
- [ ] #3 No package has an install script, and the build fails when a packed package exceeds its size budget
<!-- AC:END -->
