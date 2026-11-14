---
id: TASK-638
title: The workbench keeps Stop available while a stop is unresolved
status: To Do
assignee: []
created_date: '2026-11-14T17:38:00Z'
labels: []
dependencies: []
references:
  - >-
    backlog/tasks/task-446 -
    Workhorse-inspection-reports-actual-work-and-Stop-ends-its-whole-work-tree.md
documentation:
  - docs/adr/0048-a-workhorse-stop-ends-the-whole-work-tree.md
ordinal: 1080000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After a partial or unconfirmed stop, a sub-agent can keep running while the workhorse's own turn has ended. The workbench then shows no Stop: `readComposerTurn` reports idle when no turn is in progress, and `planComposerInterrupt` refuses with `no_active_turn` before any command is sent, so the work tree stop of TASK-446 cannot run again from the workbench. The workhorse meanwhile refuses new typed work (`work_stopping`) until a later stop succeeds. The only recovery left is to ask the voice coordinator, whose `stop_workhorses` needs no running turn; PR 116 changed the refusal messages to name that path as a stopgap. CodeRabbit found the gap in its review of PR 116 (finding on `vocabulary.ts`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser snapshot carries the stop phase of each workhorse (stopping, stopped or unresolved) as the server records it, and an open workbench sees each change of that phase.
- [ ] #2 While the last stop of the shown workhorse is stopping or unresolved, the composer offers Stop even when no turn of the workhorse is in progress, and pressing it runs the work tree stop of that checkout.
<!-- AC:END -->
