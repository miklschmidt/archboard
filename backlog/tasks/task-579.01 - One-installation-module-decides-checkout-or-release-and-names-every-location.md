---
id: TASK-579.01
title: One installation module decides checkout or release and names every location
status: To Do
assignee: []
created_date: '2026-11-05T14:58:00Z'
labels: []
dependencies: []
references:
  - packages/workspace/src/runtime/services/source-checkout.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1022000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every command finds its program through `SOURCE_CHECKOUT`, which needs a `package.json` named `archboard` with `bin/archboard` above the running file. A compiled executable runs from `/$bunfs/root`, so every command fails when it loads (spike on 2026-11-05). The frontend, core, grammars, skills, Codex location, server command, version and default port each read that root on their own today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One module reports the mode (checkout or release), the root, the version and the locations of the frontend, core, grammars, skills, bin directory, Codex binary and server command
- [ ] #2 Release mode is found only from `archboard-release.json` beside the running executable; without it the checkout rule applies, and without either the command refuses with a code and a remedy
- [ ] #3 No module outside the installation module reads `SOURCE_CHECKOUT`, enforced by lint or a boundary rule
- [ ] #4 Checkout behavior is unchanged and `bun run check` passes
<!-- AC:END -->
