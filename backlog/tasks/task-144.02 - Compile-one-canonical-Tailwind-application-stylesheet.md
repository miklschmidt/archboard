---
id: TASK-144.02
title: Configure Tailwind 4 in Vite
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 00:58'
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
- [ ] #1 vite.config.js registers the pinned @tailwindcss/vite plugin once and maps @/ to the absolute repository src directory without changing frontend root, proxy, Excalidraw handling, or output naming.
- [ ] #2 A disposable fixture imports Tailwind, scans a static class through the @/ alias, and proves generated utility output with no dependence on production app.css, shell.tsx, or later tasks.
- [ ] #3 Missing plugin, wrong alias target, alias escape, duplicate plugin, and production config drift fail with actionable fixture output.
- [ ] #4 The task claims only configuration/fixture behavior; rendered production proof remains owned by TASK-144.13, TASK-144.14, and TASK-144.11.
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
<!-- SECTION:NOTES:END -->
