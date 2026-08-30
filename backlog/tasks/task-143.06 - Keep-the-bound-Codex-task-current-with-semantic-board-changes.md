---
id: TASK-143.06
title: Keep the linked workhorse current with semantic board changes
status: To Do
assignee: []
created_date: '2026-08-30 13:34'
updated_date: '2026-08-30 15:16'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for one semantic context publisher, exact linked-workhorse delivery, and removal of the two legacy environment/control-socket injection modules delivered by TASK-143.06.01-.04. Coordinator active-voice callback delivery is owned by TASK-143.07.04.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Significant human/mixed board changes reach only the exact current executable thread link without polling or starting a turn; agent-only/cosmetic changes stay silent.
- [ ] #2 Board narration, ephemeral focus/selection context, and fresh voice-start briefs come from one publisher without a second board snapshot or thread selector.
- [ ] #3 Unbound/unavailable/prior-epoch/child-exit states expose exact no-delivery reasons, and the obsolete command, route, environment, status, and control-socket paths are deleted.
<!-- AC:END -->
