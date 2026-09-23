---
id: TASK-302.06
title: 'One conversation per canvas, whichever pane speaks'
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:40'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: high
ordinal: 528000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Thread links are kept per layout pane (A/B) while everything else the workbench runs is singular per canvas generation: one workhorse snapshot, one semantic-delivery binding, one coordinator, one realtime session, one command lease. Two panes can therefore hold two executable links while voice, queue and board news follow only the last one created; a pane without the link cannot speak to the agent, and closing the pane that created the link strands the conversation. The redesigned agent bar is one conversation for the whole canvas that a person reaches from whichever pane they are reading, and each typed turn carries that pane's board. A read-only assessment (2026-09-23) found the smallest correct change is a decorator on the thread-link port that stores the one link under a canvas key and relabels each snapshot with the pane that asked, plus fixes where the host picks a presentation pane or an approval presenter; nothing in src/runtime and nothing on the wire changes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every pane of a canvas reads the same thread link; a create or relink from any pane replaces it for all, and a command sent over any pane's transport targets it
- [ ] #2 A typed turn sent from a pane carries the board that pane shows
- [ ] #3 Concurrent creates from two panes leave one executable link and a usable workhorse
- [ ] #4 After the pane that created the link closes, the other pane can send, start and stop voice, and answer approvals
- [ ] #5 Host-started work (semantic brief, delegation context) presents through an open pane instead of refusing when the creating pane is gone
- [ ] #6 ADR 0019 epoch proof, inspect-only prior epochs, explicit create and the single lease with its link-revision check still hold; owners cover the decorator and the two-pane composition over the fake Codex
<!-- AC:END -->
