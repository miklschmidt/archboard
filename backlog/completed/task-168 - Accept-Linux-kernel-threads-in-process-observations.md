---
id: TASK-168
title: Accept Linux kernel threads in process observations
status: Done
assignee:
  - '@codex'
created_date: '2026-09-09 13:29'
updated_date: '2026-09-09 13:31'
labels: []
dependencies: []
references:
  - src/shared/process-observation/lib/linux-stat.ts
  - src/runtime/engine/tests/git-async.test.ts
priority: high
type: bug
ordinal: 319000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native process observer introduced by TASK-163 rejects the valid process-group zero in Linux kernel-thread stat records. On hosts exposing kthreadd, every process census fails with Incomplete process stat for pid 2, and detached Git commands time out. This blocks the Linux repository gate and ordinary owned-process workflows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Linux process observations accept kernel-thread parent and group zero while retaining rejection of malformed relationship identifiers.
- [x] #2 Process-group ownership and signaling continue to require positive group identifiers.
- [x] #3 The native process census and detached Git lifecycle owners pass on the affected Linux host, with focused regression, lint and type checks passing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the public Linux census error and detached Git timeout; inspect the native kernel record and ownership consumers.
2. Add deterministic runtime regression coverage for observed group zero and invalid identifiers, then allow nonnegative observed Linux relationship identifiers without broadening ownership requests.
3. Verify observation and Git lifecycle owners, focused lint, formatting and TypeScript; simplify and commit separately for integration. Parent owns the full serial gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced listProcessObservations() throwing Incomplete process stat for pid 2 and the original Git success/nonzero-exit case timing out at 5000ms. /proc/2/stat is kthreadd with parentPid=0 and pgid=0. Skipping broad hypotheses and instrumentation because the public repro and actual kernel input deterministically isolate the rejecting predicate.

Implemented nonnegative safe-integer validation for observed Linux process groups, documenting kernel-thread zero and deleting the now-unused positivePid helper. Deterministic regression went red before the fix; malformed negative, fractional, nonnumeric and unsafe-integer identifiers still reject.
Validation: native listProcessObservations() now returns kthreadd (pid 2, parentPid 0, pgid 0); bun test src/shared/process-observation/tests/observation.test.ts src/runtime/engine/tests/git-async.test.ts passes 8/8, including original detached success/nonzero-exit (~68ms), overflow, cancellation, signal, descendants and stalled-reader cleanup. bun run lint and bun run type-check pass; focused oxfmt check and git diff --check pass.
Independent consumer audit found no production zero-group signaling path: listProcessGroupObservations rejects zero, engine and Codex capture require group equal positive spawned leader PID, Codex inspection validates positive groups, and renderer traversal anchors exact process identity. No additional hypothetical guards added. Full system/browser gate is intentionally owned by the integrating parent, not duplicated here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed Linux census and detached Git failures caused by valid kernel-thread group zero. Retained malformed-identifier rejection and positive-only group ownership. Eight focused runtime tests, native host census, lint, TypeScript, formatting and diff checks pass; consumer audit confirms signaling remains guarded.
<!-- SECTION:FINAL_SUMMARY:END -->
