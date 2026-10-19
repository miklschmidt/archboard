---
id: TASK-500.24.02
title: apps/cli holds the command line
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
labels: []
dependencies:
  - TASK-500.24.01
parent_task_id: TASK-500.24
ordinal: 903000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
apps/cli is the command line: src/cli/* (commands, command-contract, command-routing), src/runtime/image-clipboard, src/bin.ts and the bin/archboard launcher target. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 apps/cli holds the CLI in area and role folders with its own tests, bin/archboard (a regular root file) runs apps/cli/src/bin.ts, checkout hand-off still runs before other CLI imports and help is answered without runtime initialization; no package imports the app
- [ ] #2 Every string path to the CLI (scripts, ci.yml, evals, skills processes, command-owner metadata, generatedFrom, system tests that import CLI internals) names the new location; the old src/cli and src/runtime directories are gone
- [ ] #3 bun run check passes
<!-- AC:END -->
