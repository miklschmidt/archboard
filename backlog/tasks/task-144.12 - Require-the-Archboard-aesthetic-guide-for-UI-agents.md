---
id: TASK-144.12
title: Require the Archboard aesthetic guide for UI agents
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:38'
updated_date: '2026-08-31 02:19'
labels: []
dependencies:
  - TASK-144.09
references:
  - docs/design/archboard-ui-aesthetics.md
modified_files:
  - AGENTS.md
parent_task_id: TASK-144
priority: high
type: task
ordinal: 234000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the durable agent-facing link from `AGENTS.md` to the Archboard UI aesthetic guide. The link tells future UI workers when the guide is mandatory without copying framework defaults or visual rules into a second source.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md requires every UI-design or UI-implementation worker to read docs/design/archboard-ui-aesthetics.md before changing rendered Archboard UI.
- [ ] #2 The instruction names the TASK-140 reference/mockup and the guide as visual authority while keeping code boundaries and verification in their existing documents.
- [ ] #3 This leaf changes only the durable link; TASK-144.16 owns automated enforcement and neither task duplicates Tailwind, shadcn, Base UI, Oxfmt, or Oxlint defaults.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the new aesthetic guide, TASK-140 authority references, and the existing AGENTS.md documentation map. 2. Add the smallest durable instruction that makes the guide mandatory for rendered UI design and implementation without duplicating framework, boundary, or verification rules. 3. Add stable repository-policy enforcement only if TASK-144.12 itself already owns it; otherwise leave automated enforcement to TASK-144.16. 4. Run focused formatting, link, diff, and repository-policy checks and submit the exact range for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.09 completed and released this dependency-ready leaf at integration HEAD 73b849a. The lane owns AGENTS.md only and is path-disjoint from all active implementation and review lanes.
<!-- SECTION:NOTES:END -->
