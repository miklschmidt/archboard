---
id: TASK-143.06.01
title: Publish one semantic Archboard context stream
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.16
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-semantic-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish one semantic Archboard context stream and explicit typed subscriptions for settled board change, pane focus, pane selection, and on-demand fresh brief. It reuses the existing change-feed settle boundary and owns no second timer.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Public ports expose settled semantic change events, immediate pane-focus events, immediate pane-selection events, and an on-demand fresh-brief query with board/pane/version/cursor/freshness identity.
- [ ] #2 Existing change-feed settle/debounce remains the sole semantic coalescing timer; the publisher filters agent-only/cosmetic noise and never snapshots a second board document.
- [ ] #3 Brief generation is deterministic, bounded to realtime limits, marks truncation/ambiguity/staleness, and includes repository/workhorse/coordinator/board/pane/version/selection/claim/doing/cursor/compact description.
- [ ] #4 Module tests prove each port independently, source classification, rapid focus/selection without settle delay, fresh on-demand reads, and no duplicate subscription/timer after reload.
<!-- AC:END -->
