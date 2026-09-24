---
id: TASK-328.04
title: Refresh Browser application and Board viewer
status: To Do
assignee: []
created_date: '2026-09-24 09:24'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 567000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser application (src/ui, frontend) after the routing and query migration, the voice UI (subtitles, narration), the walkthrough recording page, and the renamed callback and port types (PaneCallbacks, Workbench, VoiceStore).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [ ] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [ ] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->
