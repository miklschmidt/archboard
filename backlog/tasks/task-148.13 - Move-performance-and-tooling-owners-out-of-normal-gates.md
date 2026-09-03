---
id: TASK-148.13
title: Move performance and tooling owners out of normal gates
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-03 17:33'
updated_date: '2026-09-03 19:02'
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
  - src/runtime/board-inspection/tests/fixtures/partial-complement-cases.ts
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
  - tests/system/repository-policy/support/executable-bun.ts
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
1. Require path-ignore-patterns values in both separate and equals forms to be nonempty static tokens that do not begin with a dash; reject the invocation before owner inference otherwise. 2. Collect all contextual executable-Bun parse errors first and return them once before package reachability, lane, or owner validation; apply the same terminal parse-error rule before workflow policy validation. 3. Add one compact ignore-value mutation table plus exact-only diagnostic cases for an unknown bun test flag and an invalid bun run edge. 4. Run focused inventory and CI policy tests, both TypeScript checks, exact lint, format, and diff checks; record notes, commit separately, and callback READY_FOR_REREVIEW while keeping TASK-148.13 In Progress.
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

Second review remediation on top of 2ad688f6:

One executable Bun parser now owns both package graph edges and native test selection. `support/executable-bun.ts` extracts quote/comment-aware executable `bun run` and `bun test` records with parsed arguments. `test-inventory.ts` derives run edges, test selectors, and exact ignore arguments from those records. The previous raw Bun-test regex is gone. Repeated edges, whitespace-tolerant run syntax, helper traversal, and manual opt-in protection remain intact.

Two new mutation-red cases prove that `echo "bun test ..."` and `# bun test ...` text cannot claim or reach a native owner. The existing focused CI parser cases still prove echo, single-quoted substitution, comments, and whitespace behavior.

The normal partial-complement owner now runs one 32-item fixture and asserts only exact finding identities and duplicate details. The 32/64/128/256 comparison and bucket-scan matrix moved to the capacity owner. Both use one shared fixture builder under `tests/fixtures`; setup and assertions are not duplicated.

The normal package read-only owner now asserts only command status/output, byte-for-byte unchanged vault snapshot, and zero HTTP contacts. Fake-timer state, event-loop scheduling, support-artifact cleanup, and direct ingest rejection were deleted rather than relocated. Focused engine geometry validation plus normal malformed-input system owners already catch malformed width rejection, so no new ingestScene owner was justified.

Counts remain 200/83/18/16 normal and 8/13/1/2 opt-in; static inventory errors remain empty.

Focused validation: inventory plus CI policy 46 tests in 28 ms; four CI parser compatibility cases in 17 ms; normal partial-complement semantic owner 1 test in 96 ms; opt-in 32/64/128/256 work matrix 1 test in 700 ms; simplified package read-only owner 1 test in 294 ms; root TypeScript 1.69 s; frontend TypeScript 0.44 s; Oxlint 0.03 s; Oxfmt 0.002 s; diff check passed. No broad or long lane ran.

Focused tests left no `archboard-inventory-tsx-*` or `archboard-browser-preflight-*` directories in `/tmp`. Previously reported pre-existing residue remains untouched. Task stays In Progress for rereview.

Third review remediation on top of b5cd08a0:

The executable Bun parser now preserves source offsets while masking comments. It writes one space for the `#` delimiter and every non-newline comment byte, while retaining each newline. Match indexes in masked text therefore address the same byte positions in the original source before argument parsing.

New focused reds cover both `bun run` and `bun test` after a full-line comment and after a trailing comment plus newline. Both return exact arguments. A separate inventory mutation puts `bun run test:opt-in:capacity` after a full-line comment and now receives the required fail-closed opt-in reachability error. Existing comment, echo, quote, and substitution cases remain green and inert.

Deleted the normal 32-item partial-complement directional pair/formula test from `sweep-filtering.test.ts`. It was duplicate scale coverage already owned by the opt-in partial-complement capacity matrix. The normal file now contains eight unique ordinary filtering cases and passed in 59 ms.

Counts remain 200/83/18/16 normal and 8/13/1/2 opt-in because the deletion removes a duplicate case, not an owner file. Static inventory errors remain empty.

Focused validation: inventory plus CI policy 49 tests in 36 ms; remaining normal sweep-filtering semantics 8 tests in 59 ms; root TypeScript 1.73 s; frontend TypeScript 0.37 s; Oxlint passed; Oxfmt passed in 2 ms; diff check passed. The capacity representative was unchanged and was not rerun. No broad or long lane ran.

Focused tests left no `archboard-inventory-tsx-*` or `archboard-browser-preflight-*` directories in `/tmp`. Previously reported pre-existing residue remains untouched. Task stays In Progress for rereview.

Fourth review remediation on top of 1bda94ef:

The shared executable Bun parser now applies a narrow fail-closed grammar. `bun run` accepts repeated no-argument `--silent` flags before one required static script name, strips those flags before graph extraction, and reports every other leading option or unresolved script instead of guessing. `bun test` accepts only the leading runner forms used by this repository: `--isolate`, `--max-concurrency=<positive integer>`, and `--path-ignore-patterns` with a static separate or equals value. It requires at least one explicit static selector and reports unsupported options, missing option values, dynamic selectors, and broad selectorless discovery. Inventory and workflow consumers surface parser errors and exclude invalid records from graph and owner inference.

Two mutation-red owners were added. `bun run --silent test:opt-in:capacity` was previously missed and now reaches the opt-in edge, producing the existing reachability error. A reachable lane containing selectorless `bun test` previously produced no parser error and now reports that broad discovery is not inventory-safe. Comment offset preservation, inert echo and comment handling, repeated edges, helpers, manual opt-ins, exact ignores, TSX discovery, and current classifications remain green.

Focused validation: inventory plus normal CI policy passed 51 tests and 61 assertions in 51 ms; root TypeScript passed in 1.55 s; frontend TypeScript passed in 0.29 s; exact Oxlint passed; exact Oxfmt passed in 1 ms; diff check passed.

Operational note: an initial Backlog CLI notes command accidentally expanded Markdown backticks in the shell and launched selectorless `bun test`. It was terminated after 18 seconds during system board-inspection execution; no result from that accidental partial broad run was accepted as validation. No Bun test process remains. The only matching package-test residue remains the previously reported `/tmp/archboard-task-130-05-package-bjuM2J`; no inventory, browser-preflight, or HTTP residue was left. Previously reported pre-existing residue remains untouched. Task stays In Progress for rereview.

Fifth review remediation on top of a810cd1c:

Both separate and equals `--path-ignore-patterns` forms now require a nonempty static value that does not begin with a dash. A following option token, an equals option-looking value, an empty equals value, a missing value, or a dynamic value produces the same contextual fail-closed parser error. Invalid invocations are excluded before any native owner can be inferred.

Package inventory and workflow inspection now collect all contextual parser errors first and return them before reachability, lane, ownership, canonical-step, or direct-script validation. Distinct invalid invocations remain distinct parser errors, each emitted once by the shared parser with package or workflow context; dependent missing-lane, zero-run, and orphan diagnostics are suppressed.

The compact ignore-value mutation table covers a separate option token, an equals option-looking value, and an empty equals value, and asserts zero inferred lanes. A `bun test --unknown src` mutation includes an otherwise orphaned native owner and reports only its contextual grammar error. An invalid `bun run --cwd repo test:modules` edge includes an otherwise valid module owner and reports only its contextual grammar error, with no missing-lane or zero-run cascade.

Focused validation: inventory plus normal CI policy passed 56 tests and 69 assertions in 36 ms; root TypeScript passed in 1.57 s; frontend TypeScript passed in 0.30 s; exact Oxlint passed; exact Oxfmt passed in 1 ms; diff check passed. No broad or long lane ran during this remediation.

No Bun test process remains. Focused tests left no inventory, browser-preflight, or package HTTP residue. The previously reported package-test residue remains pre-existing and untouched. Task stays In Progress for rereview.
<!-- SECTION:NOTES:END -->
