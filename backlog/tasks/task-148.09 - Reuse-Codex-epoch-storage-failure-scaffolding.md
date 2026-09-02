---
id: TASK-148.09
title: Reuse Codex epoch storage-failure scaffolding
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 23:00'
updated_date: '2026-09-02 23:12'
labels: []
dependencies: []
references:
  - codex-epoch/tests/storage-failure.test.ts
  - storage-failure-support.ts
modified_files:
  - src/runtime/codex-epoch/tests/storage-failure.test.ts
  - src/runtime/codex-epoch/tests/storage-failure-support.ts
parent_task_id: TASK-148
ordinal: 281000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The storage failure matrix rebuilds 72 fsync-backed temporary roots although only injected failure phase, transition, and target vary. Preserve the full reachable failure matrix while separating durable setup from injected failure and avoiding repeated real filesystem scaffolding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All distinct transition, target, and atomic failure-phase behaviors remain covered with the same observable recovery/refusal assertions.
- [x] #2 Durable root creation and fsync-backed epoch setup are reused or replaced by the cheapest credible injected boundary; the test no longer creates a complete durable root for every matrix row.
- [x] #3 The focused owner improves materially from the recorded 7.17 seconds and leaves no temp roots or process residue.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build each transition scenario once inside one owned temporary root through the injected filesystem seam, capture its immutable manifest and records bytes, and explicitly restore those bytes before every target/phase row.
2. Make the failure filesystem skip real fsync work while preserving all nine injection points, and report close failures only after closing the real descriptor so the focused owner leaves no descriptor residue.
3. Keep every transition, twin target, restart, quarantine, and Codex-store sentinel assertion; retain the cleanup-precedence case in its own owned state.
4. Run only the exact focused owner in the required transient service, measure elapsed time against 7.17 seconds, audit its service cgroup and /tmp roots, then record the evidence and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented reusable storage-failure setup. Each transition now owns one temporary root and captures one immutable manifest/records baseline. Every target/phase row rejects unexpected lock or temp entries, restores the exact baseline bytes, and then exercises the injected failure. The matrix still covers 4 transitions x 2 targets x 9 phases, store quarantine, restart before/corrupt/after outcomes, both external-store sentinels, and primary-error preservation when cleanup also fails.

Focused evidence: `bun test src/runtime/codex-epoch/tests/storage-failure.test.ts` passed after formatting with 5 tests and 590 assertions. Measured shell elapsed time was 0.103 seconds and service runtime was 129 ms, compared with the supplied 7.17-second baseline. The passing unit finished inactive with an empty cgroup, no live descendants, and no `/tmp/archboard-codex-failure-*` roots.

Validation gap: a separate focused `bun x oxlint` attempt could not run because this checkout lacks the `tsgolint` executable. The service exited 1 with `Failed to find tsgolint executable`; its cgroup was empty and it left no descendants. No lint or type rule was changed, bypassed, or disabled. Per parent direction, no further lint, type-check, test, formatter, or broad command was run.

Finalization evidence: 4 transitions x 2 targets x 9 injected atomic failure phases retained the recovery, refusal, reset/isolation, sentinel, cleanup-precedence, and real-fsync ownership assertions. The focused owner passed with 5 tests and 590 assertions. Measured elapsed time improved from 7.17s to 0.103s; service runtime was 129ms, peak memory was 28.5M, and cleanup found no temp roots, descendants, cgroup residue, swap, or process residue. Validation gap remains: focused lint could not run because tsgolint is absent. No lint or type rule changed, bypassed, or disabled. Fixed-range spec and standards reviews were clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reused one durable fsync-backed setup per transition and restored immutable baseline bytes for each injected row. Verified the full 4 x 2 x 9 failure matrix with 590 assertions in 0.103s, down from 7.17s, with no temp-root or process residue. Fixed-range spec and standards reviews were clean; focused lint remains unavailable because tsgolint is missing.
<!-- SECTION:FINAL_SUMMARY:END -->
