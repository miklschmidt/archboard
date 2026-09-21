---
id: TASK-293.05
title: A narrator stops for pane news
status: To Do
assignee: []
created_date: '2026-09-21 02:09'
labels:
  - voice
  - coordinator
dependencies:
  - TASK-293.03
parent_task_id: TASK-293
priority: high
ordinal: 512000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During a narrated walkthrough (TASK-251) a user who picks a node is signalling that the talk did not cover it well enough. The maintainer wants the narrator to pause and ask whether they have a question about it, which is the opposite of the current prompt ("Do not stop for questions"). So during an active narration pane news is speech, not quiet context: a non-empty pick or a view or variant switch by hand makes the model pause, ask about what is now selected or on screen, and once the user has answered or declined go on by itself from the step it was on, finishing it if it was cut off; the latest of several picks wins. An emptied selection stays quiet, because clicking empty canvas should not stop a talk. Leaving the walkthrough, quiet context today, becomes a short spoken acknowledgement and the narration stops. The highlight a driven step makes is unmarked and stays silent. UNKNOWN that decides the design: whether text sent through realtimeAppendSpeech cuts off audio already being spoken or queues behind it; nothing in this repository says. Measure that in a real voice session first; if it queues, find an explicit interrupt before building on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 It is measured and written down, from a real voice session, whether appended speech interrupts audio in progress, and the design follows the answer
- [ ] #2 During a narration a pick, view switch or variant switch by hand reaches the voice model as speech that names the state and asks it to pause and check in; outside a narration the same news stays quiet
- [ ] #3 An emptied selection during a narration is quiet context, and a driven step appends nothing
- [ ] #4 Leaving a narrated walkthrough is spoken as a short acknowledgement and no further step is asked for
- [ ] #5 The voice prompt and coordinator presentation instructions make pane news the one reason to stop, and say the talk resumes by itself from the same step
- [ ] #6 The live voice browser owner shows the speech append for a pick during a narration, and the user confirmed the pause and resume by ear
<!-- AC:END -->
