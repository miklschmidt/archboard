---
id: TASK-478.02
title: >-
  A recorded walkthrough speaks to a reviewer about the system, not about the
  screen
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
labels: []
dependencies: []
parent_task_id: TASK-478
priority: medium
type: enhancement
ordinal: 841000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recorded walkthroughs in pull requests narrate the screen and joke. Transcripts in Platform #599 to #615 open beats with "On screen now: step two", "This step is about", "Here the walkthrough focuses on", and end with "That completes the walkthrough" or, in #589, "Whew! That is the story here." A reviewer reads or hears each point twice, once as the screen description and once as the content. A recording starts the same voice session as live narration (src/server/archboard/lib/walkthrough-narration.ts, header), and that session carries the live conversational persona, "dry-witted, warm and funny" (src/runtime/codex-realtime/lib/voice-prompt.ts). That persona fits a conversation with the user, not a recorded explanation for a reviewer. TASK-293 (in progress) changes what the voice model is told about where the user stands; check for overlap before changing the same messages.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recording gives its voice session narrator instructions of its own, without the live persona: speak about the system in the board's names, never about the screen, the step or the walkthrough itself, no jokes, and no closing line; live narration and conversation keep their persona
- [ ] #2 What the voice receives for each recorded beat invites no screen narration; the source of the "On screen now" and "This step" openings is found and named in the task notes
- [ ] #3 A recording made after the change, of a walkthrough in the dogfood vault, is read by a person, and its transcript in the task notes shows no screen talk, joke or closing formula
- [ ] #4 A test owner proves that a recording session receives the narrator instructions and a live narration session the persona, without matching their wording
<!-- AC:END -->
