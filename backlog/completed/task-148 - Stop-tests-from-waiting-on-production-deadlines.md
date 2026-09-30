---
id: TASK-148
title: Stop tests from waiting on production deadlines
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 21:22'
updated_date: '2026-09-03 22:07'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 271000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers and agents need fast feedback from Archboard tests. The current system suite spends 91.107 seconds on one passing pending-visual-mutation expiry owner and 354.95 seconds overall because behavior tests can wait on production wall-clock deadlines. Replace production-duration waits with deterministic clock or deadline control where the behavior does not require real elapsed time, preserve the production timeout contract, and audit the suite for the same failure class.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pending visual mutation expiry behavior is tested without waiting for the production 90-second wall-clock deadline, while the production deadline value and expiry behavior remain unchanged.
- [x] #2 The repository test suite is audited for tests that wait on production timeout or retry durations; each identified wait is replaced with deterministic time control or documented as requiring real elapsed time with evidence.
- [x] #3 The pending visual mutation owner completes in under 5 seconds, and direct one-off timing evidence demonstrates at least 80 seconds removed from normal iteration without adding or running a suite-speed proof owner.
- [x] #4 No non-redundant reachable product behavior, lint rule, type rule, or real failure path is removed or weakened to achieve the speedup. Redundant, obvious-in-normal-use, capacity, tooling, performance, stress, and unsupported-topology owners may be removed, merged, or moved to explicit opt-in suites under the accepted test policy.
- [x] #5 Automated enforcement prevents an unapproved production-duration wall-clock wait from being reintroduced into tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-143.08.01 owns removing the 91.107-second approval-expiry wait and relocating its assertion; production CODEX_APPROVAL_EXPIRY_MS remains exactly 90_000.
2. Run the independent timing-remediation children in parallel from this workbench branch.
3. Review and integrate every child before enforcing the suite-wide budget.
4. Add one 20,000 ms unapproved per-test actual-wall-clock budget only after the legitimate exception set is known.
5. Verify focused deterministic owners, static normal/opt-in reachability enforcement, and recorded direct one-off timing evidence from completed children. Do not add or run a suite-speed or concurrency-proof gate; normal gates cover only one Archboard server, one bound app-server, and one human/user topology.
6. Finalize only after coverage mapping proves no non-redundant reachable product behavior, lint/type rule, or real failure path weakened; allow removal, merging, or explicit opt-in relocation under the accepted test policy.
7. The confirmed eliminable waits include board claim and announcement leases, board-lock API caps, resource-cleanup lease expiry, one-write sleeps, and Codex process grace. The sole confirmed physical-time owner is resource-cleanup OS TERM-to-KILL behavior, bounded below four seconds by a TEST_* outer bound. Cross-process watcher delivery and browser renderer observations must be measured after raw sleeps become observable conditions before any waiver is considered. Hot-reload negative-observation windows remain TASK-143.08.01 scope.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Finalization evidence after test-policy reconciliation:

- AC1: TASK-143.08.01 records that the 91.107-second pending-visual approval-expiry wait was replaced by deterministic control while CODEX_APPROVAL_EXPIRY_MS remains 90,000 ms. Its focused expiry owner completed in 94 ms during integration.
- AC2: TASK-148.01 through TASK-148.06 replace identified lease, retry, socket, cross-process, browser, one-write, and Codex grace waits with fake clocks or observed conditions. TASK-148.04 documents the retained physical watcher condition, and TASK-148.01 retains the OS TERM-to-KILL proof under TEST_TERM_TO_KILL_MAX_MS = 4,000.
- AC3: TASK-148.13 records direct one-off removal of 9.68 s of capacity work and roughly 95.9-116.84 s of browser performance and soak work from normal iteration, about 105.58-126.52 s total. TASK-143.08.01 records the pending-visual owner at 94 ms. TASK-148.13 explicitly adds no suite-speed or concurrency-proof owner.
- AC4: Every direct child is Done with all ACs checked. TASK-148.13 records removal, merging, or opt-in relocation only for redundant, tooling, capacity, performance, stress, and unsupported-topology work; it retains reachable normal-product owners and static inventory policy. TASK-148.07 records no lint/type weakening and a focused 14-test, 26-assertion wall-clock policy run.
- AC5: TASK-148.07 records the monotonic 20,000 ms per-test budget, source-local approved real-time bounds, AST-backed static policy, and a focused 14-test, 26-assertion passing policy/preload run. TASK-148.13 records static enforcement that normal check and hosted CI cannot reach opt-in suites.

All direct children TASK-148.01 through TASK-148.13 are Done, have no recursive children, and have every child AC checked. TASK-143.08.01 is Done with 10/10 ACs checked. No broad system, browser, performance, or suite-speed lane was run for this Backlog-only reconciliation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reconciled TASK-148 with the accepted normal-test topology and completed all timing remediation. Deterministic and observed-condition owners replace production waits; source-local wall-clock policy blocks unapproved waits. Direct one-off evidence removes about 105.58-126.52 seconds from normal iteration without a suite-speed proof owner, while static inventory keeps opt-in work out of check and CI.
<!-- SECTION:FINAL_SUMMARY:END -->
