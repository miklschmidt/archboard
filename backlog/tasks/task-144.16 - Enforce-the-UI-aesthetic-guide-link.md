---
id: TASK-144.16
title: Enforce the UI aesthetic guide link
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-31 02:38'
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
- [ ] #1 The test requires the exact tracked docs/design/archboard-ui-aesthetics.md path in the UI-worker instruction and fails when the file or link is missing.
- [ ] #2 It does not snapshot prose, Tailwind/shadcn/Oxc versions, or changing defaults; only the durable authority relationship is enforced.
- [ ] #3 bun run test:repository and bun run check execute the test with an actionable failure and no documentation exception.
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
<!-- SECTION:NOTES:END -->
