---
id: TASK-579.05
title: A release starts the Codex binary of its platform package directly
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:29:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/codex-app-server/src/runtime/services/executable.ts
  - node_modules/@openai/codex/bin/codex.js
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1026000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today Codex must lie under the checkout `node_modules`, and its launcher `bin/codex.js` needs Node.js. A release depends on the Codex platform package at the exact pin, for example `npm:@openai/codex@<version>-linux-x64`, and must work in both a nested npm layout and the hoisted global layout of `bun add -g`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In release mode Archboard finds `vendor/<triple>/bin/codex` of the installed platform package in nested and hoisted layouts and starts it without Node.js
- [ ] #2 It sets `CODEX_MANAGED_PACKAGE_ROOT` and the `CODEX_MANAGED_BY_*` variable as `bin/codex.js` does
- [ ] #3 A Codex of another version is still refused by the exact `--version` proof
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. executable.ts: add releasedIn option; find @openai/codex-<os>-<cpu> beside or above the release platform package (nested and hoisted), start vendor/<triple>/bin/codex directly, keep the exact --version proof. 2. nativeCodexEnvironment: process owner sets CODEX_MANAGED_PACKAGE_ROOT and one CODEX_MANAGED_BY_* for a native binary. 3. Installation.codexInstalledIn becomes codexLocation ({installedIn}|{releasedIn}); call sites pass it. 4. Tests: nested, hoisted, missing, wrong version, spawn environment.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: releasedIn option (installedIn stays, it is the voice package's public contract); nearest @openai/codex-<os>-<cpu> wins like Node resolution, the exact --version proof refuses another version; managed env derived from the native binary path in the process owner (keeps the resolveCodexExecutable mock seam of system fixtures); manager = bun if path has .bun, pnpm if .pnpm, else npm. Installation.codexInstalledIn replaced by codexLocation. Commit e915f8e06. Gate: codex-app-server 675 pass, workspace 47 pass, vp run types, vp run lint:all, format:check, repository-policy 163 pass.
<!-- SECTION:NOTES:END -->
