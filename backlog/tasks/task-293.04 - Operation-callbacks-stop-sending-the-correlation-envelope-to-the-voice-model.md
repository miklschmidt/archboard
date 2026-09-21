---
id: TASK-293.04
title: Operation callbacks stop sending the correlation envelope to the voice model
status: To Do
assignee: []
created_date: '2026-09-21 02:09'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-293
priority: medium
ordinal: 511000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Terminal workhorse outcomes already run a coordinator turn (TASK-291), but accepted, queued, started, progress and attention are still appended to the live voice session as the full callback JSON (deliverThroughVoice). The first three repeat what delegate_to_workhorse already answered the coordinator (mode started or queued, the turn id, the queued submission id), and progress is readable through inspect_workhorse. Attention is different: the workhorse needs the user, so somebody has to decide what they hear. Independent of the pane work; can land at any time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 accepted, queued, started and progress callbacks are recorded and delivered to nobody while voice is live
- [ ] #2 An attention callback runs the coordinator the way a terminal outcome does, with the same busy-coordinator fallback, so the coordinator decides what the user hears
- [ ] #3 No code path appends a callback envelope to the voice session, and a focused owner proves it for every operation type
- [ ] #4 DESIGN.md states which callbacks go where
<!-- AC:END -->
