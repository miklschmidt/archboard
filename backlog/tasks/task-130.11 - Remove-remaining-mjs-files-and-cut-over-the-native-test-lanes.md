---
id: TASK-130.11
title: Remove remaining mjs files and cut over the native test lanes
status: To Do
assignee: []
created_date: '2026-08-28 01:06'
labels: []
dependencies:
  - TASK-130.01
  - TASK-130.02
  - TASK-130.03
  - TASK-130.04
  - TASK-130.05
  - TASK-130.06
  - TASK-130.07
  - TASK-130.08
  - TASK-130.09
  - TASK-130.10
references:
  - package.json
  - .oxlintrc.jsonc
  - bunfig.toml
  - docs/agents/test-suite.md
  - scripts/generate-cli-contract.mjs
  - scripts/lib/cli-contract-artifacts.mjs
  - scripts/lib/doing.mjs
  - scripts/probe-arrow-refs.mjs
  - scripts/reload.mjs
  - scripts/repair-labels.mjs
  - scripts/sync-skills.mjs
  - src/cli/command-contract/tests/public-runner-fixture.mjs
parent_task_id: TASK-130
priority: high
type: chore
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Complete the migration only after every check lane is native. Convert or delete the eight non-check .mjs files, remove the temporary scripts/**/*.mjs lint exception, prohibit the extension across tracked and untracked non-ignored files, and replace the long package script chain with a few explicit native lanes.

Keep authored inputs. Delete stale operational or repair scripts when no real workflow calls them. Convert reachable scripts to TypeScript and put reusable behavior behind the owning module interface instead of preserving a scripts/lib bucket by inertia.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every non-check .mjs file is either deleted with a repository reference audit proving no reachable workflow needs it, or converted to a type-checked .ts file with unchanged public command behavior.
- [ ] #2 The final repository has no tracked or untracked non-ignored .mjs path and no .mjs-specific lint or formatter exception.
- [ ] #3 A native repository-policy test scans git ls-files --cached --others --exclude-standard, lists every forbidden path, suggests TypeScript conversion, and has a negative self-test with no repository mutation.
- [ ] #4 package.json exposes a small set of explicit module, system, repository, and serial-browser lanes; every native test belongs to exactly one lane and browser tests cannot enter recursive or parallel discovery.
- [ ] #5 Bun file isolation is used where it improves independence. Parallel execution is enabled only for a measured lane whose resource-ownership checks prove it safe; no task adds parallelism merely because Bun 1.4 supports it.
- [ ] #6 The old check scripts, obsolete local failure-counter helpers, redundant package scripts, and empty script directories are removed rather than retained as compatibility paths.
- [ ] #7 docs/agents/test-suite.md and package command help name the new lanes, prerequisites, ordering, timeouts, could-not-run behavior, and focused commands for one test file or name.
- [ ] #8 bun install --frozen-lockfile, bun run lint, bun run fmt:check, bun run type-check, every focused lane, the complete bun run test chain, bun run check, and git diff --check pass from a clean checkout.
- [ ] #9 A final inventory maps every former check to native test files and proves all legacy observable contracts still run once on a push.
<!-- AC:END -->
