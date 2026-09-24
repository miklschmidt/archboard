---
id: TASK-328.02
title: 'Refresh Archboard server, Board persistence and Board rasterizer'
status: To Do
assignee: []
created_date: '2026-09-24 09:24'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 565000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server (renamed from canvas server, src/server/archboard), the semantic board store (board and variant renames with formerNames, replaced-relationship notices) and the headless-browser pictures. Walkthrough recording (TASK-304: archboard semantic record, the recording page, tab capture, the voice mixed into the file) shares the headless browser and is drawn on Board rasterizer, which keeps its name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [ ] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [ ] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->
