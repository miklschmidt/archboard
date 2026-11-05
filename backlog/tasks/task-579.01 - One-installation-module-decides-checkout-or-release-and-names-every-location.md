---
id: TASK-579.01
title: One installation module decides checkout or release and names every location
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:14:00Z'
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
- [x] #1 One module reports the mode (checkout or release), the root, the version and the locations of the frontend, core, grammars, skills, bin directory, Codex binary and server command
- [x] #2 Release mode is found only from `archboard-release.json` beside the running executable; without it the checkout rule applies, and without either the command refuses with a code and a remedy
- [x] #3 No module outside the installation module reads `SOURCE_CHECKOUT`, enforced by lint or a boundary rule
- [x] #4 Checkout behavior is unchanged and `bun run check` passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add packages/workspace/src/runtime/services/installation.ts: resolveInstallation({executable, moduleDirectory}) decides release (archboard-release.json beside the executable or in the parent of its bin/), else checkout (today's rule), else coded refusal INSTALLATION_NOT_FOUND; damaged marker -> RELEASE_MARKER_INVALID. Export installation() through @archboard/workspace/installation.
2. Report mode, root, version, frontend/core/grammars/skills/bin directories, codexInstalledIn, serverCommand and coreHash source.
3. Remove SOURCE_CHECKOUT; source-checkout.ts keeps port and hand-off and reads installation().root. Migrate every reader (server, cli, server-lifecycle, workbench, scripts, tests).
4. Add no-restricted-imports of SOURCE_CHECKOUT to both oxlint configs.
5. bin.ts prints a refusal cleanly. Tests: mode detection for checkout, release and neither. Run bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: installation() is lazy and memoized (resolveInstallation is the testable pure form). Release root is the directory with archboard-release.json beside the executable or in the parent of its bin/. A damaged marker refuses with RELEASE_MARKER_INVALID and does not fall back to the checkout; neither refuses with INSTALLATION_NOT_FOUND. SOURCE_CHECKOUT is deleted; source-checkout.ts keeps the port and hand-off and reads installation().root. Scripts and tests read installation().root too (no separate checkout accessor). Workbench sourceRoot injection and module-paths.ts removed; production.ts reads skillsDirectory and binDirectory. Provisional for siblings: RELEASE_SERVER_ARGUMENT (579.07), codexInstalledIn (579.05), grammarsDirectory in a checkout is the query directory (wasm still resolves from node_modules). Boundary rule: no-restricted-imports of SOURCE_CHECKOUT from any */source-checkout module in .oxlintrc.jsonc and .oxlintrc.tests.jsonc, plus import/named. Gate: bun run check stops in lint:all on scripts/build-core.ts:177 (typescript/no-unnecessary-condition on ran.exitCode ?? 1), untouched and present at HEAD fbc4731cb; every other lane passes. .archboard vault modules that mention SOURCE_CHECKOUT not updated.

Integration gate: after b769329e1 fixed the build-core lint error, `nix develop --command bash -c "bun run build:core && bun run check"` exited 0 (21/21 tasks successful).
<!-- SECTION:NOTES:END -->
