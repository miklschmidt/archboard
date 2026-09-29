---
id: TASK-373
title: >-
  Each browser session has its own workhorse thread, and the thread selector is
  gone
status: To Do
assignee: []
created_date: '2026-09-29 12:31'
labels:
  - codex
  - voice
  - frontend
dependencies: []
priority: high
type: feature
ordinal: 658000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user, 2026-09-29: thread linking is silly. A canvas holds one thread link that every pane and every browser shares (ADR 0019 as amended by TASK-302), and a thread selector still lists every persisted Codex thread as a candidate, coordinator threads included; choosing a coordinator thread there links it as if it were a workhorse. Since TASK-301 each replaced coordinator adds one more such row. The user decided that each browser session has its own Codex workhorse thread: the tab keeps the thread id in sessionStorage, so a reload keeps the conversation and a new tab or window starts a new one; the thread is created automatically on that session's first message or voice start; and the thread selector goes away.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A browser tab's first message or voice start creates a workhorse thread for that tab, and every later message and voice session from the tab runs on it
- [ ] #2 A reload of the tab keeps its thread, and a new tab or window starts a new one
- [ ] #3 No thread selector, candidate list or link control remains in the browser, and code that served only them is deleted
- [ ] #4 Two tabs on one Archboard server hold two separate conversations
- [ ] #5 ADR 0019, CONTEXT.md, the operator shell design and the affected boards describe a workhorse per browser session
<!-- AC:END -->
