---
id: TASK-148
title: Stop tests from waiting on production deadlines
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 21:22'
updated_date: '2026-09-02 21:36'
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
- [ ] #1 The pending visual mutation expiry behavior is tested without waiting for the production 90-second wall-clock deadline, while the production deadline value and expiry behavior remain unchanged.
- [ ] #2 The repository test suite is audited for tests that wait on production timeout or retry durations; each identified wait is replaced with deterministic time control or documented as requiring real elapsed time with evidence.
- [ ] #3 On the same host, the pending visual mutation owner completes in under 5 seconds and bun run test:system improves by at least 80 seconds from the recorded 354.95-second baseline.
- [ ] #4 No behavior assertion, test owner, lint rule, type rule, or failure path is removed or weakened to achieve the speedup.
- [ ] #5 Automated enforcement prevents an unapproved production-duration wall-clock wait from being reintroduced into tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-143.08.01 owns removing the 91.107-second approval-expiry wait and relocating its assertion; production CODEX_APPROVAL_EXPIRY_MS remains exactly 90_000.
2. Run the independent timing-remediation children in parallel from this workbench branch.
3. Review and integrate every child before enforcing the suite-wide budget.
4. Add one 20,000 ms unapproved per-test actual-wall-clock budget only after the legitimate exception set is known.
5. Run focused tests and changed browser owners, then run bun run test:system twice on this host against the recorded 354.95-second baseline; require at least 80 seconds improvement.
6. Finalize only after coverage mapping proves no assertion, test, lint, or type weakening.
7. The confirmed eliminable waits include board claim and announcement leases, board-lock API caps, resource-cleanup lease expiry, one-write sleeps, and Codex process grace. The sole confirmed physical-time owner is resource-cleanup OS TERM-to-KILL behavior, bounded below four seconds by a TEST_* outer bound. Cross-process watcher delivery and browser renderer observations must be measured after raw sleeps become observable conditions before any waiver is considered. Hot-reload negative-observation windows remain TASK-143.08.01 scope.
<!-- SECTION:PLAN:END -->
