---
id: TASK-293.06
title: >-
  Outside changes and agent pane switches are told to the voice model and the
  coordinator
status: To Do
assignee: []
created_date: '2026-09-21 02:09'
labels:
  - voice
  - coordinator
dependencies:
  - TASK-293.03
  - TASK-293.05
parent_task_id: TASK-293
priority: medium
ordinal: 513000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent that is neither the workhorse nor the coordinator (another harness with its own thread, or a bare command line) can write a board or switch a pane with browser show while voice is live. Neither model asked for it, and once the voice model holds a state ("the user is looking at payments") such a change makes that state false. Every write already states its session (change.by, a thread id, null when nobody said), the evidence ownSessionReason uses to spare the workhorse its own writes. Rule: by equal to the linked workhorse thread or the coordinator thread tells nobody, because their outcome arrives through the TASK-291 coordinator turn; any other by, unattributed included, on a board some pane of this canvas shows, is one quiet sentence per write to the voice model and into the coordinator thread without starting a turn, for example "Board payments was just changed by another agent, which says it is adding the retry queue (data)". A write is already one whole thing somebody asked for, so nothing is coalesced. An agent switching a pane is told the same way, worded so it never credits the user: "The pane that showed payments now shows ledger; an agent put it there (data)". During an active narration both are speech: the model says the picture or the board changed under the talk and asks how to go on. The coordinator has no tool that writes a board or switches one, so telling it cannot loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A board write whose stated session is the linked workhorse or the coordinator reaches neither model; any other write to a board a pane shows reaches both as one sentence, quiet, with no coordinator turn started
- [ ] #2 A write to a board no pane shows tells nobody
- [ ] #3 browser show by an agent is told to both models in words that do not credit the user, and its recorded reason stays agent
- [ ] #4 During an active narration an outside change to the narrated board and an agent pane switch are speech
- [ ] #5 A system owner proves the attribution rule with two stated sessions and one unattributed write, and DESIGN.md describes outside changes
<!-- AC:END -->
