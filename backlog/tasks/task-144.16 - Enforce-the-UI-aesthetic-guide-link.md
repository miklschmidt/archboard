---
id: TASK-144.16
title: Enforce the UI aesthetic guide link
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 16:58'
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
