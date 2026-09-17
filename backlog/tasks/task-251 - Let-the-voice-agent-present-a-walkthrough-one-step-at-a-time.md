---
id: TASK-251
title: 'Let the voice agent present a walkthrough, one step at a time'
status: To Do
assignee: []
created_date: '2026-09-17 08:24'
labels:
  - voice
  - frontend
  - codex
dependencies:
  - TASK-250
references:
  - DESIGN.md
ordinal: 438000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user wants the voice agent to give a walkthrough as a talk: explain each step aloud, move the pane to the next step when it has finished speaking, and let the person interrupt at any point to ask something before it moves on. The constraint that shapes this is in DESIGN.md: the GPT-Live voice model never sees tool calls or tool results, only coordinator prose prefixed [BACKEND] under a 1,000-token budget. So a step cannot reach the voice model as data; the coordinator has to navigate the pane and then hand the step over as prose. The flow the user described: voice asks the coordinator for the next step; the coordinator drives the pane there through a typed tool and is told when the pane has finished navigating (TASK-250 exposes that); the coordinator then delivers that step to the voice model, which speaks it; the voice model asks for the next step only when it is done, so an interjection simply delays that. Presentation position stays presentation state the browser owns; the coordinator drives it the way it already drives live panes. Open question to measure rather than assume: a coordinator turn per step may be too slow, in which case the whole script could be delivered at the start with only navigation per step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person can ask the voice agent to present a walkthrough, and the linked pane enters the presentation at its first step
- [ ] #2 The coordinator moves the pane to a step through a typed tool that answers only once the step has finished arriving, or with the reason it could not
- [ ] #3 After each step has arrived the voice model receives that step to explain, and the next step is requested only after it has finished speaking
- [ ] #4 A person interrupting mid-explanation gets an answer, and the presentation does not advance until the voice agent asks for the next step
- [ ] #5 A step the person changes by hand, or leaving the presentation, is told to the coordinator and voice model so the narration follows the picture
- [ ] #6 Time from the end of one explanation to the start of the next is measured and recorded in the task
- [ ] #7 Covered by coordinator and tool contract tests, and verified end to end with a real voice session
<!-- AC:END -->
