---
id: TASK-144.16
title: Enforce the UI aesthetic guide link
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-31 02:29'
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
<!-- SECTION:NOTES:END -->
