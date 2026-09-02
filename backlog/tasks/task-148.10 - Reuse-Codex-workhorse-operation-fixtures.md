---
id: TASK-148.10
title: Reuse Codex workhorse operation fixtures
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:13'
labels: []
dependencies: []
references:
  - codex-workhorse-operations tests/support.ts
  - the three affected test files
modified_files:
  - src/runtime/codex-workhorse-operations/tests/support.ts
  - src/runtime/codex-workhorse-operations/tests/fixture-group.ts
  - src/runtime/codex-workhorse-operations/tests/operations.test.ts
  - src/runtime/codex-workhorse-operations/tests/delivery.test.ts
  - src/runtime/codex-workhorse-operations/tests/operation-id.test.ts
parent_task_id: TASK-148
ordinal: 282000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three workhorse test files create roughly 29 fsync-backed fixtures although the loop usually varies only queue.nextOutcome. Reuse immutable committed proof and reset only the mutable queue/outcome state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All operation and outcome contracts remain covered, including state isolation between cases.
- [ ] #2 Durable fixture setup occurs once per compatible group rather than once per outcome iteration, with explicit reset/clone semantics preventing cross-case leakage.
- [ ] #3 The focused three-file owner improves materially from the recorded 19.3 seconds and cleans all temporary state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add an explicit fixture group that durably prepares one epoch and its three committed thread proofs, then clones the finished epoch files into a unique temporary root for each case. Recreate the session, queue, operation closures, calls, subscribers, and other mutable state for every clone; make fixture and group cleanup detect leaked cases.
2. Give each of the three owner files its own lifecycle-bound default fixture group. Keep a separate group for the stale/current identity case because its child epoch and operation authority differ. Retain all operation and outcome assertions while replacing per-case durable setup calls.
3. Run the exact three-file focused owner once after the change inside the required 20-second transient user service, record elapsed time against 19.3 seconds, and audit the service cgroup plus all archboard-workhorse-operations temporary roots. Run only cheap non-Bun source inspections outside that lane, then update Backlog notes and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Blocked before validation. The only focused owner attempt ran in transient user unit archboard-task14810-focused-20260903c with KillMode=control-group, RuntimeMaxSec=20s, TimeoutStopSec=5s, MemoryMax=6G, MemorySwapMax=1G, and OOMPolicy=kill. Bun exited 1 after 73 ms of test time and 119 ms of service runtime because zod could not be resolved from codex-instructions; 0 passed, 3 files failed during module loading. The unit was collected and is inactive with no control group. No /tmp/archboard-workhorse-operations-* roots remained. Per the delegated service-failure rule, no dependency install, retry, further project command, commit, or finalization was attempted. Uncommitted draft edits add per-owner prepared fixture groups and per-case epoch-file clones, but they remain unvalidated.

Resumed after the parent authorized frozen dependency materialization. bun install --frozen-lockfile completed in transient unit archboard-task14810-install-20260903a in 151 ms; package.json, bun.lock, and tracked source were unchanged. The final implementation prepares one frozen proof set and durable epoch baseline per owner file, clones only the two finished epoch files into a unique case root, and rebuilds every identity ledger, queue, session, operation instance, subscriber set, call counter, status, and hook. The custom current-epoch identity case retains its distinct standalone fixture. The queue outcome matrix now checks every clone starts with no queue calls, delivered as its default outcome, and exactly the four prepared epoch records.

Final exact three-file owner: 28 pass, 0 fail, 177 assertions in 5.543 s wall time and 5.52 s Bun time, versus the accepted 19.3 s baseline. This is 13.757 s faster, a 71.3% reduction. Focused Oxlint passed with 0 warnings and 0 errors. Focused Oxfmt check passed. Every transient unit was inactive with an empty ControlGroup before the next command. The final temp-root audit found no /tmp/archboard-workhorse-operations-* directories. package.json and bun.lock remained unchanged, and no debug instrumentation remains.
<!-- SECTION:NOTES:END -->
