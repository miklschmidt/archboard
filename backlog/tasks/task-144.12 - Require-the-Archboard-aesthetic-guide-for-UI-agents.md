---
id: TASK-144.12
title: Require the Archboard aesthetic guide for UI agents
status: To Do
assignee: []
created_date: '2026-08-30 15:38'
updated_date: '2026-08-30 15:48'
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
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md requires every UI-design or UI-implementation worker to read docs/design/archboard-ui-aesthetics.md before changing rendered Archboard UI.
- [ ] #2 The instruction names the TASK-140 reference/mockup and the guide as visual authority while keeping code boundaries and verification in their existing documents.
- [ ] #3 This leaf changes only the durable link; TASK-144.16 owns automated enforcement and neither task duplicates Tailwind, shadcn, Base UI, Oxfmt, or Oxlint defaults.
<!-- AC:END -->
