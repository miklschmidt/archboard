---
id: TASK-130.11
title: Remove remaining mjs files and cut over the native test lanes
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-28 01:06'
updated_date: '2026-08-29 03:51'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Last-task boundary and exact resulting product. Start only after TASK-130.01 through TASK-130.10 are integrated and the real inventory is green. Predecessors already own all check-script package remaps, parity, fixture moves, and check-script deletions. This task does not recover, defer, or repeat any predecessor deletion. It owns only: conversion/deletion of the eight remaining non-check .mjs files; the native no-.mjs repository policy; final package lane names/layout; final test-suite documentation and active command references. No product behavior changes.

2. Exact eight-file legacy disposition:
- scripts/generate-cli-contract.mjs -> scripts/generate-cli-contract.ts with identical argv, default/relative/absolute output-directory resolution, exit 2 usage error, artifact write order, stdout lines, and bytes.
- scripts/lib/cli-contract-artifacts.mjs -> src/cli/command-contract/artifacts.ts, a typed public root entrypoint for CLI_CONTRACT_ARTIFACT_NAMES and renderCliContractArtifacts. The generator and contract tests import this entrypoint; no scripts/lib replacement is created.
- scripts/lib/doing.mjs -> delete after every predecessor check is gone. Its test mechanics are already narrow same-owner typed support in the owning system directories; there is no general replacement helper.
- scripts/probe-arrow-refs.mjs -> delete after a repository reference audit. TASK-130.04 native human rebind/reroute coverage owns the reachable stale-ref product proof; the unreferenced exploratory console probe is not retained.
- scripts/reload.mjs -> scripts/reload.ts with byte-equivalent success/failure stdout/stderr and exit behavior through the public canvas-client/config entrypoints.
- scripts/repair-labels.mjs -> delete after a repository reference audit. TASK-130.04 owns label repair, drift, stale-ref, file-byte, and real-route coverage; no package, instruction, or current workflow invokes this historical repair.
- scripts/sync-skills.mjs -> scripts/sync-skills.ts with identical skill discovery, byte copying, retired-name cleanup, relative symlinks, sorted output, no-skills exit 1, and derived-directory behavior.
- src/cli/command-contract/tests/public-runner-fixture.mjs -> src/cli/command-contract/tests/public-runner-fixture.ts with the same argv record, loopback routes, public runner invocation, exact streams/status, and forced server cleanup.
Delete all eight old .mjs paths in the same serialized integration as their replacements/reference updates. Do not preserve compatibility wrappers.

3. Exact authored/edited file scope. Create scripts/generate-cli-contract.ts, scripts/reload.ts, scripts/sync-skills.ts, src/cli/command-contract/artifacts.ts, src/cli/command-contract/tests/public-runner-fixture.ts, and tests/system/repository-policy/no-mjs.test.ts. Edit package.json, .oxlintrc.jsonc, tools/oxlint-plugin-archboard.js, docs/agents/test-suite.md, docs/agents/boundaries.md, AGENTS.md, TESTING.md, skills/archboard-dev/SKILL.md, src/cli/command-contract/tests/support.ts, tests/system/cli/command-contract-artifacts.test.ts, tests/system/cli/command-workflows.test.ts, tests/system/cli/support/artifact-fixture.ts, tests/system/repository-policy/boundaries.test.ts, tests/system/repository-policy/skills.test.ts, tests/system/repository-policy/test-inventory.test.ts, src/dev-canvas.ts, src/server/canvas/lib/application.ts, src/runtime/engine/reload-canary.ts, src/runtime/engine/board-io.ts, src/runtime/engine/fonts.ts, src/runtime/engine/measure-text.ts, and src/runtime/engine/expand-elements.ts. Keep src/cli/command-contract/tests/runner.test.ts byte-identical unless its observable assertions genuinely need correction; it remains in focused validation. Delete the eight source paths listed in step 2. Review bunfig.toml and leave it byte-identical because it contains no extension or lane exception. Every created or converted TypeScript test, support, fixture, command, and module entrypoint in this task stays at or below 500 physical lines. Do not write generated docs/design/generated artifacts; they remain reproducible ignored output.

4. Native no-.mjs policy. tests/system/repository-policy/no-mjs.test.ts is tests/system-owned and scans exactly git ls-files --cached --others --exclude-standard. It retains the typed git ls-files subprocess result and fails on spawn error, signal, or nonzero exit with command, cwd, status, signal, stdout, and stderr diagnostics. A pure typed path-list function consumes only successful stdout, treats every .mjs entry as forbidden regardless of directory, reports all paths in stable order, and tells the maintainer to convert the file to typed TypeScript or delete it; the exact Git command alone owns ignored-file exclusion. Exercise it with a synthetic negative fixture containing tracked-like and untracked-like paths, duplicates, and non-MJS controls, with no helper-level ignored-path filtering and no checkout mutation. Before atomic deletion/cutover, run only the named synthetic path-list negative and do not run the complete real-checkout test. After atomic deletion/cutover, run the complete no-mjs.test.ts and require the real checkout to return an empty list. Keep the test and any local fixture at or below 500 physical lines; do not add a generic repository scanner or modify TASK-130.02 support.

5. Conversion parity before deletion. While old/new files coexist in a disposable checkout:
- Run both generator entrypoints for missing --output-dir, default output, relative output, and absolute output; compare status, stdout/stderr, exact filename order, raw bytes, and SHA-256 across all three artifacts, twice from absent directories.
- Run old/new reload entrypoints against the same owned loopback success and refusal doubles; compare exact generation/PID message, URL, stderr, and exit.
- Run old/new sync entrypoints against identical temporary skill roots; compare copied bytes, retired removal, symlink targets, sorted stdout, idempotence, real source preservation, and no-skills refusal.
- Run old/new public-runner fixtures over every held-output compatibility record and compare exact public stdout/stderr/status and cleanup.
For doing, probe-arrow-refs, and repair-labels, record rg and package/docs/eval audits showing no reachable caller after predecessor cutovers, and run the named TASK-130.04/.08/.09/.10 native proofs that supersede their test mechanics. No behavior is moved into a broad helper merely to retain dead files.

6. Lint/config cutover. Remove the remaining scripts/**/*.mjs override from .oxlintrc.jsonc. Remove TEMPORARY_UNTYPED_TEST_SOURCE and its conditional bypass from tools/oxlint-plugin-archboard.js; change the positive disposable boundary fixture and selector in boundaries.test.ts to public-runner-fixture.ts; remove the temporary untyped-fixture exception paragraph from docs/agents/boundaries.md; change command-contract tests/support.ts to spawn public-runner-fixture.ts; and make tests/system/cli/support/artifact-fixture.ts import CLI_CONTRACT_ARTIFACT_NAMES from the new module-root artifacts.ts instead of owning a second literal list. Preserve TASK-130.01 test type-safety, complexity, and max-lines rules. If executable TypeScript needs console permission, grant no-console only to the exact three script entrypoints; do not disable complexity, explicit-any, unsafe assertions, or other type rules for scripts or tests. Update active references to .ts in package.json, AGENTS.md, TESTING.md, archboard-dev, command-contract tests, CLI workflow/artifact tests, and skills tests. In AGENTS.md replace active test:module-scope and test:suites commands with the exact module-scope-policy focused command and final test:repository lane, and describe one typed serial browser lane rather than four checks. In skills/archboard-dev/SKILL.md replace test:module-scope and test:hot with the exact module-scope-policy.test.ts and hot-reload.test.ts focused commands. Replace only remaining active guard and caught-regression references with their native owners: src/dev-canvas.ts and src/runtime/engine/reload-canary.ts point to tests/system/repository-policy/module-scope-policy.test.ts; src/server/canvas/lib/application.ts points to tests/system/process-contracts/local-bind.test.ts; the one-reader guard in src/runtime/engine/board-io.ts points to tests/system/boards/image-persistence.test.ts; src/runtime/engine/fonts.ts and src/runtime/engine/measure-text.ts point to src/runtime/engine/tests/text-metrics.test.ts; and the label-loop reference in src/runtime/engine/expand-elements.ts points to src/runtime/engine/tests/label-input.test.ts. Preserve TASK-130.10's landed browser comment ownership byte-for-byte: src/ui/canvas/elements.ts and the fixed-point arbiter in src/runtime/engine/expand-elements.ts point to tests/system/browser/fixed-point-document.test.ts, while the live-session catches in src/runtime/engine/board-io.ts and src/runtime/engine/expand-elements.ts point to tests/system/browser/live-session-convergence.test.ts. Do not edit src/ui/canvas/elements.ts; in board-io.ts and expand-elements.ts touch only the remaining predecessor references named above. Historical ADR and design prose may keep historical names. runner.test.ts invokes public-runner-fixture.ts. No tracked or untracked nonignored .mjs path remains after cutover.

7. Exact final package lane layout. Replace all transitional test:* keys with four final keys and reach every native test once through bun run check:
- test:modules = bun test --isolate src
- test:system = bun test --isolate --max-concurrency=1 tests/system/support tests/system/boards tests/system/label-geometry tests/system/cli tests/system/board-inspection tests/system/canvas-state tests/system/process-contracts
- test:repository = bun test --isolate tests/system/repository-policy
- test:serial-browser = bun tests/system/browser/run-browser-lane.ts tests/system/browser/human-edit-performance.test.ts tests/system/browser/fixed-point-document.test.ts tests/system/browser/malformed-geometry-recovery.test.ts tests/system/browser/pane-telemetry-recovery.test.ts tests/system/browser/arrow-binding-differential.test.ts tests/system/browser/finding-export.test.ts tests/system/browser/shell-layout.test.ts tests/system/browser/typed-text.test.ts tests/system/browser/live-session-convergence.test.ts tests/system/browser/server-update-ordering.test.ts tests/system/browser/hold-generation.test.ts tests/system/browser/human-hold-persistence.test.ts tests/system/browser/claim-interaction.test.ts.
Set test exactly to bun run type-check && bun run test:modules && bun run test:system && bun run test:repository && bun run test:serial-browser. Set lint exactly to oxlint . and remove both lint:skills and lint:code. Set fix exactly to oxlint --fix . && bun run fmt && bun test tests/system/repository-policy/skills.test.ts, in that order, so the focused native skills policy runs exactly once. Set check exactly to bun run lint && bun run fmt:check && bun run test. Remove the predecessor test keys; skills.test.ts runs once on the check path through test:repository. Update generate:cli-contract, sync:skills, and reload to their .ts entrypoints. No --parallel, --concurrent, --randomize, --changed, or recursive tests/system root can include browser tests. max-concurrency=1 protects the real-process system lane and the source-mutating hot-reload file; the browser adapter remains strictly one file/process at a time. Do not add parallelism without a later measured task.

8. Final inventory and docs contracts. Update TASK-130.02 test-inventory expectations from the mixed transitional chain to these four exact lane categories and prove every discovered module, system, repository, and browser test has one owner and one push path. It must reject a missing path, duplicate path, browser path in system/module/repository, recursive browser discovery, or an extra transitional test key. docs/agents/test-suite.md maps every former check to its native files, describes module/system/repository/serial-browser ownership, exact focused bun test path/name commands, headless agent-browser and strace prerequisites, build-once behavior, could-not-run exit 2, source-mutating hot isolation, process cleanup, ordering, and timeouts. Active setup docs use scripts/sync-skills.ts; reload docs/package use scripts/reload.ts. Historical ADR/design prose and deliberate negative-test literals may name a former command or .mjs path, but no active command, eval grader, package key, or file list points at a deleted path. After cutover run an active-reference audit for every removed package key and all eight deleted paths, including AGENTS.md and skills/archboard-dev/SKILL.md.

9. Exact focused and full validation. Before deletion run the parity matrix in step 5 and only the named synthetic no-MJS negative:
bun test tests/system/repository-policy/no-mjs.test.ts --test-name-pattern "lists every forbidden .mjs path and suggests TypeScript conversion"
bun test src/cli/command-contract/tests/runner.test.ts tests/system/cli/command-contract-artifacts.test.ts tests/system/cli/command-workflows.test.ts tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/skills.test.ts tests/system/repository-policy/test-inventory.test.ts
After atomic deletion/cutover run the complete real-checkout policy:
bun test tests/system/repository-policy/no-mjs.test.ts
bun test tests/system/repository-policy/boundaries.test.ts
Then run git ls-files --cached --others --exclude-standard and require no .mjs result, followed by:
bun install --frozen-lockfile
bun run lint
bun run fmt:check
bun run type-check
bun run test:modules
bun run test:system
bun run test:repository
bun run test:serial-browser
bun run test
bun run check
git diff --check
Run all commands sequentially from a clean checkout. The browser lane and hot-reload test never overlap another browser/hot run. Audit live children/listeners/vaults after system and browser lanes.

10. Overlap, ownership, and integration order. This task deliberately revisits only these predecessor-owned native files for final path/lane references: command-contract-artifacts.test.ts, command-workflows.test.ts, and artifact-fixture.ts from TASK-130.07; boundaries.test.ts and the oxlint plugin from TASK-130.01; skills.test.ts and test-inventory.test.ts from TASK-130.02; and support.ts plus the public-runner fixture inside the CLI command-contract module. runner.test.ts remains a focused validation owner but is not edited unless its observable assertions genuinely need correction. It does not change any predecessor observable expectation. tests/system/repository-policy/no-mjs.test.ts is a disjoint new file; no-mjs policy is owned only here. package.json is the shared integration choke point and this task edits it only after all predecessor package cutovers. Required integration order is TASK-130.02, then one predecessor at a time with full validation (recommended TASK-130.03, TASK-130.06, TASK-130.04, TASK-130.05, TASK-130.07, TASK-130.08, TASK-130.09, TASK-130.10), then TASK-130.11. Only disjoint native authoring may overlap; package edits, eval edits, legacy deletion, and integration never do. TASK-130.10 reconciliation is final: consume its landed 13-file serial-browser list and comment ownership exactly, and do not create human-edit-acknowledgement.test.ts, typed-text-element.test.ts, or typed-label.test.ts.
<!-- SECTION:PLAN:END -->
