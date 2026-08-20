---
id: TASK-062
title: >-
  The dirty indicator compares timestamps, so it cannot see a note that is ahead
  of the canvas
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
labels: []
dependencies: []
references:
  - frontend/src/shell/Shell.tsx
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server, and it explains an incident from this session.

frontend/src/shell/Shell.tsx around 202 decides whether a board is dirty by comparing a change time against a save time. A timestamp comparison can only answer "changed since the last save". It cannot answer "the note on disk is ahead of what this pane is holding", and it shows clean in exactly that case.

That is the direction the reported incident went. The canvas held 45 and 34 elements while the notes on disk held 55 and 50, and nothing on screen said so. A human looking at the board had no way to know which copy was newer, and the indicator said everything was fine.

TASK-047 fixed a related bug in the same function, where a branch left boardInfo pointing at a board the pane was not showing. This is the other half: even pointed at the right board, the comparison cannot express the state that actually cost something.

What it should be able to say is which of the two is ahead, not merely that they differ. archboard already records the sha-256 of a note's bytes when it reads it (ADR 0006), so the material for a real answer is there.

Note that a decision on the stateless server question may remove the concept of an unsaved board altogether, in which case this indicator changes meaning rather than getting fixed. Worth sequencing after that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The indicator distinguishes a canvas ahead of its note from a note ahead of its canvas
- [ ] #2 A note changed on disk while a pane holds an older copy is visible without running a command
<!-- AC:END -->
