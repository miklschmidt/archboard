---
id: TASK-144.16
title: Enforce the UI aesthetic guide link
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-31 02:41'
labels: []
dependencies:
  - TASK-144.12
references:
  - docs/design/archboard-ui-aesthetics.md
modified_files:
  - tests/system/repository-policy/ui-aesthetic-guidance.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 243000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the stable repository-policy check that future UI agents cannot lose the mandatory aesthetic-guide link from `AGENTS.md`. It validates references only and copies no visual or framework policy.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The test requires the exact tracked docs/design/archboard-ui-aesthetics.md path in the UI-worker instruction and fails when the file or link is missing.
- [x] #2 It does not snapshot prose, Tailwind/shadcn/Oxc versions, or changing defaults; only the durable authority relationship is enforced.
- [x] #3 bun run test:repository and bun run check execute the test with an actionable failure and no documentation exception.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read AGENTS.md, the aesthetic guide, TASK-144.12 evidence, and repository-policy inventory conventions. 2. Add the smallest stable repository-policy owner that requires the exact tracked guide path inside the UI-worker instruction and fails actionably when the link or file is absent. 3. Mutate only the durable authority relationship in negative fixtures; do not snapshot prose, framework versions, tools, visual tokens, or defaults. 4. Prove the owner is reached exactly once by test:repository/check through focused inventory and repository-policy tests, then submit the immutable range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.12 finalized at integration HEAD f01ac49. This new repository-policy owner is path-disjoint from every active implementation lane; broad repository/check execution remains root-owned and memory-capped.

Implementation commit db928f69ac3cae8d7be9c7c26c648c7f43e18941 adds the sole owned repository-policy test. Focused evidence: the owner passed 4 tests/8 expectations; the focused inventory owner passed 39 tests/69 expectations; bunx oxlint on the owner, bun run type-check, bunx oxfmt --check on the owner, and git diff --check passed. The owner proves the exact AGENTS.md UI-worker guide relationship, missing-link and missing-file failures with actionable diagnostics, and one check -> test -> test:repository reachability. No broad repository, system, check, or browser lanes were run per delegation; acceptance criteria remain unchecked and task remains In Progress.

Reviewer remediation commit e6a1e73d676be0070d839f5a5599d4f2ccad8f10 closes the two authority gaps: the owner now checks exact cached Git trackedness separately from regular-file existence, and scopes the UI-worker relationship to the exact ## UI visual authority section. Added focused negative fixtures for an untracked guide replacement and for moving the instruction outside that section. Remediation evidence: owner passed 6 tests/10 expectations; focused inventory owner passed 39 tests/69 expectations; bunx oxlint on the owner, bun run type-check, bunx oxfmt --check on the owner, and git diff --check passed. Broad repository, system, check, and browser lanes remain intentionally unrun; task remains In Progress and ACs remain unchecked.

Root integration and finalization evidence (2026-08-31):
- Independent complete-range rereview returned REVIEW_CLEAN at exact worker HEAD 8dc60dd46f29fd827c27cf7d1fd9f33d52f3df5d.
- Integrated the review-clean range as 30e382d through d64e5be.
- Root-owned capped owner plus complete inventory passed in archboard-task14416-focused-d64e5be.service with MemoryMax=6G and MemorySwapMax=1G: 45 tests, 79 expectations, exit 0, peak 40.2M, swap 0, no limit hit.
- The owner independently rejects a missing link, changed path, missing file, untracked replacement, and instruction moved outside the exact UI visual authority section. Diagnostics name AGENTS.md or the exact guide path and the required add/restore action.
- The complete inventory proves this test appears exactly once through check -> test -> test:repository, with no package, CI, selector, configuration, or documentation exception.
- Focused Oxlint, Oxfmt, type-check, git diff --check, exact cached git trackedness, and clean status passed. The combined repository lane remains independently red only in active TASK-144.10; this owner and its reachability contract are directly green without weakening or excluding any check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added stable repository-policy enforcement for the UI-worker aesthetic-guide authority relationship, including exact section placement, exact tracked guide path, actionable missing/untracked failures, and once-only execution through the existing repository lane.
<!-- SECTION:FINAL_SUMMARY:END -->
