---
id: TASK-148.13
title: Move performance and tooling owners out of normal gates
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-03 17:33'
updated_date: '2026-09-03 18:35'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - package.json
  - AGENTS.md
  - docs/agents/test-suite.md
  - tests/system/repository-policy/test-inventory.test.ts
  - tests/system/repository-policy/support/test-inventory.ts
  - tests/system/browser/run-browser-lane.ts
  - tests/system/browser/support/agent-browser.ts
  - TASK-148.12
  - TASK-143.08.05
modified_files:
  - AGENTS.md
  - docs/agents/boundaries.md
  - docs/agents/test-suite.md
  - package.json
  - src/runtime/board-inspection/tests/large-input-indexes.test.ts
  - src/runtime/board-inspection/tests/large-input-indexes-capacity.test.ts
  - src/runtime/board-inspection/tests/sweep-filtering.test.ts
  - src/runtime/board-inspection/tests/sweep-filtering-capacity.test.ts
  - src/runtime/board-inspection/tests/sweep-ordering.test.ts
  - src/runtime/board-inspection/tests/sweep-partial-complement.test.ts
  - src/runtime/board-inspection/tests/sweep-partial-complement-capacity.test.ts
  - src/runtime/codex-dynamic-tools/tests/wire-ownership.test.ts
  - src/runtime/codex-dynamic-tools/tests/wire-capacity.test.ts
  - src/runtime/codex-transport/tests/write-boundaries.test.ts
  - src/runtime/codex-transport/tests/write-capacity.test.ts
  - src/runtime/engine/tests/text-metrics.test.ts
  - tests/system/board-inspection/package-read-only.test.ts
  - tests/system/board-inspection/package-read-only-contract.test.ts
  - tests/system/browser/run-browser-lane.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/repository-policy/ci-browser-gate.test.ts
  - tests/system/repository-policy/ci-gate.test.ts
  - tests/system/repository-policy/legacy-injection-retirement.test.ts
  - tests/system/repository-policy/support/browser-runner-fixtures.ts
  - tests/system/repository-policy/support/test-inventory.ts
  - tests/system/repository-policy/test-inventory.test.ts
parent_task_id: TASK-148
priority: high
type: task
ordinal: 285000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers and CI need fast, dependable feedback from normal test gates across the repository. The supported normal product topology is one Archboard server, one package-local bound Codex app-server session, and one human user/editor. Concurrency within that topology may remain in normal product tests only when it represents reachable product behavior and is owned by the cheapest credible stable interface.

Everything outside that topology is opt-in only: multi-Archboard-server, multi-Codex-app-server, or multi-user scenarios; stress, soak, load, capacity, resource-contention, performance/benchmark, runner-concurrency, test-infrastructure, and upstream-tooling behavior; and test-suite speed or concurrency proof. Audit every owner and command reached by normal development and CI gates, including module, system, repository-policy, browser, scripts/adapters, and any other package/check inventory. Remove or merge redundant, obvious-in-normal-use, duplicate, or tool-only tests rather than automatically relocating them. Retained opt-in owners must be available only through clearly named explicit commands or suites.

Normal and opt-in inventories must be complete for their declared scopes, statically disjoint, and enforced so the normal gate cannot reach an opt-in owner. Record direct one-off timing evidence for runtime removed from normal iteration; do not add performance tests merely to prove the speedup.

Implementation must wait for TASK-143.08.05 and for reconciliation of the active TASK-148.12 runner candidate because both touch the browser-runner seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Normal product tests cover only the supported topology of one Archboard server, one package-local bound Codex app-server session, and one human user/editor; concurrency remains only when it represents reachable behavior in that topology and has the cheapest credible stable owner.
- [ ] #2 Normal development gates, bun run check, and hosted CI, including future restoration of browser coverage, exclude opt-in-only multi-server, multi-app-server, multi-user, stress, soak, load, capacity, resource-contention, performance/benchmark, runner-concurrency, test-infrastructure, upstream-tooling, and suite-speed/concurrency-proof owners.
- [ ] #3 Every test owner and command reached by normal development and CI gates is classified repository-wide, including module, system, repository-policy, browser, scripts/adapters, and any other package/check inventory, by concrete regression and cheapest credible interface.
- [ ] #4 Retained opt-in-only owners are reachable only through clearly named explicit suites or commands.
- [ ] #5 Redundant, obvious-in-normal-use, duplicate, and tool-only tests are removed or merged rather than automatically relocated.
- [ ] #6 Static policy uses the cheapest stable enforcement to prove normal and opt-in inventories are complete for their declared scopes, disjoint, and unreachable from the normal gate.
- [ ] #7 No test exists solely to prove normal-suite speed improvement or browser-runner concurrency; direct one-off timing evidence records runtime removed from normal iteration without a slow performance gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reclassify the six board-inspection candidates case by case. Restore sweep-ordering and ordinary sweep semantics to normal module ownership, and move only scale loops or ceilings into clearly named capacity files. 2. Extend the existing package-script graph so whitespace-tolerant Bun edges, all scripts, manual opt-in commands, and reachable helper-selected native owners are checked fail-closed. Add the three requested mutation-red reachability cases. 3. Discover `.test.tsx` and `.spec.tsx` owners and add one static inclusion case. 4. Remove the duplicated real-workflow/environment assertion from the opt-in browser policy owner and correct AGENTS.md plus boundaries.md normal/opt-in wording. 5. Run only the requested focused owners and exact static checks, update task evidence, create a separate remediation commit, and callback READY_FOR_REREVIEW.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reconciliation decision before implementation: DROP TASK-148.12 candidate 4d16c2a1. Do not cherry-pick, rebase, copy, or revive any part of that candidate. Canonical base is 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25; TASK-143.08.05 is Done.

Implemented from canonical base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25.

Repository-wide classification:
- Normal product lanes retain 196 module owners, 83 system owners, 18 repository-policy owners, and 16 serial-browser owners. These cover supported one-server, one-bound-app-server, one-human-editor behavior and reachable short races through the cheapest stable product interfaces.
- `test:opt-in:capacity` owns 9 scale/capacity owners: six board-inspection ceilings, dynamic-wire retention, transport frame size, and the frozen app-server capacity authority.
- `test:opt-in:tooling` owns 13 infrastructure/tool owners: two renderer fixture owners, five owned-process/browser support owners, the package process harness, the git opener watchdog, browser-selection/CI-adapter policy, and two wall-clock self-tests.
- `test:opt-in:topology` owns the one two-Archboard-server same-vault lock process contract.
- `test:opt-in:browser-performance` owns the 10,000-element human-edit measurement and 42-cycle live-session convergence soak; the typed runner requires `--opt-in` and rejects cross-inventory selections.
- `opt-in:renderer-chromium` and `opt-in:renderer-emulation` retain manual upstream/rendering probes outside the native test inventory.

Removed or merged instead of relocated:
- Removed the benchmark-only 2,000 warm text-measurement deadline.
- Removed duplicate browser-owner count/prose policy and redundant local adapter-selection coverage.
- Removed repository-policy runner interruption/cleanup timing simulations and duplicate predecessor-oracle scanning.
- Split the normal package read-only product contract from its opt-in timeout/signal/process harness, and split normal transport/wire behavior from capacity loops.

Static enforcement discovers native tests under `src`, `tests/system`, and `tests/opt-in`; parses each Bun invocation and exact ignore independently; rejects undeclared lanes, orphaned owners, duplicate selections, normal/opt-in overlap, opt-in reachability from `check`, and browser inventory mixing. A normal CI owner proves hosted CI invokes only `bun run check` with the pinned hosted exceptions.

Timing evidence: a direct one-off `bun run test:opt-in:capacity` passed 36 tests and 495 assertions in 9.68 s, all removed from normal module iteration. Existing recorded owner evidence puts human-edit performance at 55.9-76.84 s and the convergence soak at about 40 s, so an available real-browser run removes a further roughly 95.9-116.84 s from normal iteration. No speed-proof test was added.

Focused verification: root TypeScript 1.66 s; frontend TypeScript 0.45 s; format 0.18 s; lint 0.11 s; repository inventory plus CI policy 41 tests in 23 ms; normal package read-only contract 1 test in 183 ms. Exact Bun ignore wiring was exercised for both new normal/opt-in wire and transport splits. No broad lane or forbidden path was used.

Residue check found only pre-existing `/tmp/archboard-task-130-05-package-bjuM2J` and `/tmp/archboard-owned-canvas-*` entries with timestamps earlier than this task. They were left untouched.

Review remediation on top of 59ee3a44:

Corrected owner classification:
- Normal module ownership is now 200 files. Sweep ordering stays wholly normal. `large-input-indexes.test.ts`, `sweep-filtering.test.ts`, and `sweep-partial-complement.test.ts` retain ordinary ordering, filtering, stable identity, exact findings, and semantic oracle cases.
- Opt-in capacity is now 8 files. Comparison and input ceilings remain opt-in. Three new `*-capacity.test.ts` files contain only large index loads, multi-thousand segment/matrix work, active-profile bounds, and scale formulas. Dynamic-wire retention, transport frame capacity, and frozen app-server capacity remain opt-in.
- System, repository, serial-browser, tooling, topology, and browser-performance file counts remain 83, 18, 16, 13, 1, and 2.

The package graph now uses the existing quote/comment-aware executable Bun parser for every script edge, preserves repeated edges for duplicate detection, accepts whitespace between `bun`, `run`, and the script name, and records native selections for every package script. Known manual renderer opt-ins and all opt-in test commands are protected explicitly. A native opt-in owner reached from `check` through an arbitrary helper is rejected even when the helper name is not a test lane.

Four mutation-red cases now prove the repaired holes: `bun  run test:opt-in:capacity`, direct `bun run opt-in:renderer-chromium`, `check` through `verify:capacity` to a native capacity owner, and discovery of both `.test.tsx` and `.spec.tsx` fixtures.

Removed the duplicated real-workflow and hosted-environment assertion from `ci-browser-gate.test.ts`; normal `ci-gate.test.ts` remains the single owner. The opt-in file keeps unique workflow-parser, hosted-exception, and browser-adapter behavior.

Documentation now calls `bun run test` and the four package lanes the whole normal suite. `docs/agents/boundaries.md` names the explicit opt-in categories without owner counts. The test guide documents TSX inventory and helper-chain protection.

Focused validation: inventory plus normal CI policy 44 tests in 33 ms; unique opt-in CI-browser parser case 1 test in 20 ms; normal inspection semantics 20 tests in 614 ms; one deterministic case from each new capacity file passed in 99 ms, 193 ms, and 118 ms; package read-only contract passed in 199 ms; root TypeScript 1.80 s; frontend TypeScript 0.44 s; Oxlint 0.06 s; Oxfmt 0.20 s; diff check passed. Static counts were 200/83/18/16 normal and 8/13/1/2 opt-in with no inventory errors.

Focused tests left no `archboard-inventory-tsx-*` or `archboard-browser-preflight-*` directories in `/tmp`. Previously reported pre-existing residue remains untouched. Task stays In Progress for rereview.
<!-- SECTION:NOTES:END -->
