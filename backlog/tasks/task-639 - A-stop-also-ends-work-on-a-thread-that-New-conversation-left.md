---
id: TASK-639
title: A stop also ends work on a thread that New conversation left
status: To Do
assignee: []
created_date: '2026-11-14T17:58:00Z'
labels: []
dependencies: []
references:
  - >-
    backlog/tasks/task-446 -
    Workhorse-inspection-reports-actual-work-and-Stop-ends-its-whole-work-tree.md
documentation:
  - docs/adr/0048-a-workhorse-stop-ends-the-whole-work-tree.md
ordinal: 1081000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
New conversation (`threadLinks.create` in `thread-links.ts`) moves a workhorse to a new thread without looking at the old one. `retireThread` unloads the old thread only once nothing runs on it, so a turn, sub-agents or queued requests on the old thread keep running. The work tree stop of TASK-446 reads only the thread the workhorse is linked to now, so no Stop reaches that work, and a stop can report stopped while it runs. The same happens to a typed start or steer whose request was already sent to Codex when New conversation completed. PR 116 refuses a typed message whose thread the workhorse left before the request is sent (`link_changed`), but a request already in flight still lands on the old thread. CodeRabbit found the gap in its review of PR 116 (finding on `browser-gateway.ts`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A stop of a workhorse also stops the work still running or queued on each thread that its New conversation left, under the same outcome and evidence rules as its current work tree, until that work has ended.
- [ ] #2 A typed start or steer whose request reached Codex after New conversation moved the workhorse is stopped by the next stop of that workhorse.
<!-- AC:END -->
