---
id: TASK-500.24.02
title: apps/cli holds the command line
status: To Do
assignee: []
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 19:23'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Unbarrel command-routing/index.ts and command-contract/common.ts (rewrite importers by name); delete the dead refusals.ts, route-options.ts and thrown-message.ts.
2. Move src/cli, src/runtime/image-clipboard, src/bin.ts and scripts/generate-cli-contract.ts into apps/cli/src/{cli,runtime}/<role>/<behavior>/ (protocol, rules, clients, store, operations) with tests in apps/cli/tests mirroring them; rewrite importers to # imports (the dynamic import order of bin.ts is unchanged).
3. Spawn, never import: the generator runs by path from the root script, skill-links.test.ts learns the shipped skills from install-skill --print-source, the system artifact test keeps only spawn assertions and the registry comparison moves to an app test.
4. Update path strings: bin/archboard, package.json, ci.yml, command-owner paths in run.ts, generatedFrom, evals, docs, skills processes (archboard.ts, isolation.ts, provenance.ts, classify.ts) and their tests.
5. Verify: tsc x2, lint, fmt:check, apps/cli and repository-policy tests, CLI system tests, real bin/archboard runs, then bun run check.
<!-- SECTION:PLAN:END -->
