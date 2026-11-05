---
id: TASK-579.08
title: bun run release builds the launchers and the three platform packages
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T14:59:00Z'
updated_date: '2026-11-05T16:55:00Z'
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
  - docs/agents/releasing.md
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend compileRelease to return the npm packages the executable bundles (from the metafile) and to prepare skills/archboard with release links at the tag.
2. scripts/release/notices.ts writes THIRD_PARTY_NOTICES.md: Bun, PR Lens, the fonts with their OFL texts, the Rust crates of both core crates (cargo metadata, wasm32), and the npm packages (executable metafile, production dependency closure, Tailwind and Vite). Each distinct license text once.
3. scripts/release/build.ts (the release-packages Vite+ task, bun run release) compiles the three targets, writes each platform manifest (os, cpu, exact Codex alias from CODEX_PROTOCOL_VERSION), LICENSE with the version, README, and the two launchers (launcher.sh, optionalDependencies at the exact version), refuses install scripts, packs each with bun pm pack and refuses a tarball over its budget.
4. scripts/release/smoke.ts installs a launcher from a local registry stub (Codex from registry.npmjs.org) with npm or bun add -g and runs --version, start, status and stop on a PATH without Bun, Node.js or Rust.
5. tests/system/process-contracts/release-launcher.test.ts owns the launcher's nested and hoisted lookup, argument and status pass-through, and refusal.
6. docs/agents/releasing.md describes the build and the smoke test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- The worktree started at main (d1efde070, the Codex 0.166.0 upgrade), which fix/core-build-feedback lacks, so a fast-forward was impossible. The branch had no commits of its own, so it was reset to fix/core-build-feedback (08f8e8d49) and the work sits on top of it.
- The Vite+ task is release-packages: Vite+ refuses a task with the name of a package.json script, and the script is bun run release.
- compileRelease prepares skills/archboard with release links (prepareSkillArtifacts with release: version and commit), so every caller of the compile gets the shipped copy, and returns bundledPackages from the Bun metafile for the notices.
- Notices: the executable's packages are exact (metafile). The browser bundle has no module list, so the notices cover the production dependency closure of the root package.json (optional dependencies left out: they are the build machine's native packages), plus tailwindcss and vite, which write code into the bundle. Rust crates come from cargo metadata for wasm32 (normal dependencies of archboard-renderer-wasm and archboard-painter-wasm). Each distinct license text appears once; 335 npm packages and 118 crates, 616 KB.
- The launcher has os [darwin, linux]: it is a POSIX script, so npm refuses Windows early. On an Intel Mac or another CPU it prints the supported platforms.
- Budgets (bun pm pack, gzip 9) measured 2026-11-05: linux-x64 62.9 MiB, linux-arm64 62.6 MiB, darwin-arm64 52.7 MiB, launchers 3.3 KB. Budgets 66, 66, 56 MiB and 4 KiB. A temporary 1000-byte budget for archboard made the build exit 1 naming the package.
- scripts/release/smoke.ts imports nothing from the checkout, so a CI runner with Bun and npm and no dev shell runs it. The registry stub runs on the script's event loop, so commands run with Bun.spawn, not spawnSync (spawnSync deadlocked the install).
<!-- SECTION:NOTES:END -->
