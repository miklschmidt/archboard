---
id: TASK-148.13
title: Move performance and tooling owners out of normal gates
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-03 17:33'
updated_date: '2026-09-03 17:34'
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
