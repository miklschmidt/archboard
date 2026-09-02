---
id: TASK-144.02
title: Configure Tailwind 4 in Vite
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-09-02 22:50'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - vite.config.js
  - src/shared/timing/timing.ts
  - tests/system/repository-policy/support/vite-tailwind-contract.ts
  - tests/system/repository-policy/support/vite-tailwind-fixture.ts
  - tests/system/repository-policy/vite-tailwind-allocation-cleanup.test.ts
  - tests/system/repository-policy/vite-tailwind-contract.test.ts
  - tests/system/repository-policy/vite-tailwind-failure-pairing.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure Tailwind 4's Vite plugin and @/ runtime alias. Verification here uses a disposable self-contained Vite/Tailwind/alias fixture; production stylesheet and shell proof belong to TASK-144.13-.14.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 vite.config.js registers the pinned @tailwindcss/vite plugin once and maps @/ to the absolute repository src directory without changing frontend root, proxy, Excalidraw handling, or output naming.
- [x] #2 A disposable fixture imports Tailwind, scans a static class through the @/ alias, and proves generated utility output with no dependence on production app.css, shell.tsx, or later tasks.
- [x] #3 Missing plugin, wrong alias target, alias escape, duplicate plugin, and production config drift fail with actionable fixture output.
- [x] #4 The task claims only configuration/fixture behavior; rendered production proof remains owned by TASK-144.13, TASK-144.14, and TASK-144.11.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update vite.config.js with one @tailwindcss/vite plugin registration and one absolute @/ alias rooted at this repository’s src directory, preserving the existing frontend root, output naming, proxy, and Excalidraw worker handling.
2. Add one self-contained repository-policy owner that creates a disposable Vite fixture, loads the canonical config behavior, imports Tailwind from an aliased fixture module, and asserts generated utility CSS.
3. Add independent negative fixture cases for absent/duplicate Tailwind plugin, wrong or escaping alias targets, and production-config drift, with actionable build/config failures.
4. Run the focused owner and proportionate repository, type, lint, format, and frontend-build checks; preserve unrelated work and leave task completion to the parent review.

5. Remediate fixture safety by moving all generated files to an OS-temporary root, using a test-only alias for build, and adding signal/interruption, collision, parallel lint/read, cwd, overlap, drift, path-normalization, and git-integrity coverage.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.01 finalized at integration HEAD a098684. This leaf owns only the Vite Tailwind plugin, canonical @/ alias, and self-contained fixture proof; production stylesheet and rendered-shell behavior remain protected.

Implemented the canonical Vite seam and disposable proof. `vite.config.js` now registers `@tailwindcss/vite` once and maps `@` to the absolute repository `src`; `tests/system/repository-policy/vite-tailwind-contract.test.ts` builds an isolated Tailwind fixture and rejects missing/duplicate plugin, wrong/escaping alias, and production-config drift with actionable diagnostics. Focused fixture, repository-policy, module, type, lint, format, and frontend-build checks pass.

Remediation validation: all generated fixture files now live beneath OS temporary roots, with a temporary dependency symlink for Tailwind resolution and test-only aliasing. Focused owner passes 19 tests including throw, child-failure, SIGTERM, collision, parallel lint/read, cwd, overlap, separator, drift, and git snapshot checks. Sequential `bun run test:repository` passes 149 tests; sequential `bun run test:modules` passes 1013 tests; type-check, lint, format check, and frontend build pass. The earlier concurrent module-lane attempt was invalid due unrelated global fixture contention and was rerun sequentially successfully.

Second remediation: the disposable Vite/Tailwind owner now registers its temporary root before writes, installs scoped SIGINT/SIGTERM and exit cleanup, uses readiness stdout plus stdin event waiting, and unconditionally reaps spawned children while preserving primary failures. Alias checks now model Vite string/regex matching, require one exact @ mapping, reject only @ overlaps, and allow unrelated aliases. Added pre-ready/post-ready signal/failure cleanup, parallel-owner isolation, checkout snapshots, and dependency-link target assertions.

Third remediation: allocation now invokes a synchronous owner callback immediately after mkdtemp and exposes deterministic hooks for every setup, readiness, callback, and build-start phase. The real child matrix interrupts all phases and verifies no temporary root, dependency link, child, checkout status, or diff residue. Alias validation structurally rejects every additional @/ string prefix and uses a documented anchored-literal-prefix regex policy that fails closed otherwise; object and array alias normalization is exercised outside the repository cwd. Shared primary/cleanup pairing preserves both failures in order, including multiple cleanup failures and root removal.

Fourth remediation: fixture allocation now uses mkdtempSync so ownership registration occurs in the same synchronous turn as root creation; an external watcher interrupts 200 real allocation owners, alternating SIGTERM 143 and SIGINT 130, with no root/link/child/checkout residue. Regex aliases now require a fully anchored literal prefix and reject ambiguous alternation/other unparsed forms fail-closed. Cleanup pairing tracks failure presence explicitly, preserving thrown undefined and primary-before-cleanup ordering.

Fifth-round remediation: owner subprocess cleanup now tracks the exact synchronously registered fixture root only; duplicated signal/exit lifecycle code is consolidated, and a concurrent same-parent owner test proves interrupting one owner leaves the other owner's root/link live while an unrelated prefixed sibling survives. Alias-overlap validation now parses the complete RegExp source under a closed anchored-literal grammar and rejects unparsed alternation and other unsupported constructs fail-closed. The 200-owner allocation case uses TEST_VITE_TAILWIND_ALLOCATION_CASE_TIMEOUT_MS from src/shared/timing/timing.ts, whose comment documents the exact workload coupling.

Sixth-round remediation supersedes the earlier mkdtempSync allocation wording: each owner chooses a random exact candidate path, registers that candidate before mkdirSync, and creates it exclusively; EEXIST retires the uncreated candidate without cleanup and retries. Fixture disposal tracks created state and setup guards stop further async work after disposal, preserving exact-root cleanup through pre-create, create, and setup interruption. The external watcher now consumes pre-creation allocation records and proves all 200 allocated candidates become accounted-for roots with alternating 143/130 exits and no residue; collision retry and concurrent same-parent sibling survival remain covered. The literal regex contract now allows fully parsed disjoint /^@admin/ and /^@admin\/panel/ controls while retaining exact overlap and unsupported-grammar refusals.

Seventh-round remediation: fixture disposal now waits for an explicit allocation-settled handshake and tracks candidate, owned, and retired states. A pre-create async or sync disposal request cannot memoize a no-op before mkdirSync; if this process creates the candidate afterward, cleanup still removes exactly that root, while EEXIST candidates remain foreign and are retired without removal. Setup guards prevent in-flight recreation after disposal. The public helper regression exercises disposal inside onAllocated before creation, and the existing signal matrix covers the pre-create signal boundary. The 200-owner regression now treats bounded existsSync polling of each printed candidate path as authoritative; fs.watch is only an optional wake-up/acceleration signal, with exact candidate/root accounting and no dependence on lossy event delivery.

Eighth-round remediation: durable fixture ownership now remains true until exact-root removal succeeds, and cleanup waits for all tracked fixture work before its final removal. Disposal failures clear only the failed attempt memo, so a later cleanup call retries after transient removal failure; render-start disposal and in-flight output recreation are covered by public regressions. The concurrent-owner check now uses bounded polling of both exact allocated paths; fs.watch is only an optional wake-up for the 200-owner observation case, with no event-count dependency. Validation: focused allocation regressions (5 pass, 25 assertions), full vite-tailwind-contract suite (42 pass, 90 assertions), type-check, lint, format check, and frontend build. Per the app OOM instruction, the 200-owner stress, modules, system, complete check, and browser lanes were not rerun in this round; prior evidence remains recorded above.

Ninth-round remediation: candidate-local ownership validation is now immutable per allocation attempt; retained EEXIST fixtures reject both assertActive and run after retry, and the foreign occupied directory remains byte-identical. Exact-root observation awaits the named polling interval when no wake callback exists. Watcher setup is optional and caught; a focused regression proves polling continues after simulated watcher failure. Validation: focused allocation ownership cases (7 pass, 38 assertions), type-check, format check, lint, and git diff --check. The 200-owner stress and all broad modules/repository/system/check/browser lanes remain intentionally skipped per the app OOM instruction.

Root integration and finalization evidence (2026-08-31):
- Independent ninth-round complete-range review returned REVIEW_CLEAN at exact worker HEAD cd11e7e220fba2c41e779e6aa582657bd13504e.
- Integrated the review-clean range through orchestration HEAD 25532ee.
- Root-owned full task scope passed in capped unit archboard-task14402-focused-25532ee.service with MemoryMax=8G and MemorySwapMax=1G: 51 tests, 336 expectations, exit 0, peak 565.8M, swap 0, no limit hit. This included the previously deferred 200-owner exact-root observation case plus contract, allocation cleanup, failure pairing, collision, watcher-failure, interruption, alias, and configuration-drift owners.
- Capped type-check passed in archboard-task14402-typecheck-25532ee.service: exit 0, peak 1.3G, swap 0, no limit hit.
- Capped lint passed in archboard-task14402-lint-25532ee.service: 0 warnings/errors, peak 1.5G, swap 0, no limit hit.
- Capped frontend build passed in archboard-task14402-build-25532ee.service: 2,446 modules transformed, exit 0, peak 1.4G, swap 0, no limit hit.
- git diff --check and clean worktree status passed. The combined repository lane separately exposed one failure in active TASK-144.10, not in this task-owned scope; every TASK-144.02 owner passed and no exception was added.
- Production rendered proof remains explicitly owned by TASK-144.11, TASK-144.13, and TASK-144.14.

Historical note, 2026-09-03: TASK-143.08.07 removed the disposable Vite/Tailwind contract, allocation, cleanup, and frontend-style-entry fixtures. Their self-testing process machinery had become disproportionate to the wiring it guarded. The canonical package pins, Vite configuration, application stylesheet, and normal frontend build remain.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Configured the pinned Tailwind Vite plugin and canonical @ alias, added a disposable isolated fixture with deterministic failure and cleanup coverage, and passed the complete task-owned suite including the 200-owner allocation case under memory caps.
<!-- SECTION:FINAL_SUMMARY:END -->
